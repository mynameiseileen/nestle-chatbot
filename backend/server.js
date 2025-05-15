require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
const { SearchClient, SearchIndexClient, AzureKeyCredential } = require('@azure/search-documents');
const neo4j = require('neo4j-driver');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware setup
const allowedOrigins = [
  'https://ambitious-island-06ab78d0f.6.azurestaticapps.net',
  'http://localhost:3000'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Azure AI Search setup
const searchCredential = new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY);
const indexClient = new SearchIndexClient(
  `https://${process.env.AZURE_SEARCH_SERVICE_NAME}.search.windows.net`,
  searchCredential
);

// Function ensures search index exists
async function ensureSearchIndex() {
  try {
    const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
    
    // First checks if index exists
    try {
      await indexClient.getIndex(indexName);
      console.log('Search index already exists - using existing index');
      return; // If index exists, return
    } catch (error) {
      if (error.statusCode === 404) {
        // If index doesn't exist, create it
        const index = {
          name: indexName,
          fields: [
            { name: "id", type: "Edm.String", key: true },
            { name: "text", type: "Edm.String", searchable: true, analyzer: "en.microsoft" },
            { name: "url", type: "Edm.String" },
            { name: "category", type: "Edm.String", filterable: true }
          ],
          semanticSettings: {
            configurations: [
              {
                name: "default",
                prioritizedFields: {
                  titleField: { fieldName: "text" },
                  prioritizedContentFields: [{ fieldName: "text" }],
                  prioritizedKeywordsFields: []
                }
              }
            ]
          }
        };
        
        await indexClient.createIndex(index);
        console.log('Search index created with semantic configuration');
      } else {
        throw error;
      }
    }
  } catch (error) {
    // Handles errors during index creation
    console.error('Error ensuring search index:', error.message);
    throw error;
  }
}

// Create search client for querying
const searchClient = new SearchClient(
  `https://${process.env.AZURE_SEARCH_SERVICE_NAME}.search.windows.net`,
  process.env.AZURE_SEARCH_INDEX_NAME,
  searchCredential
);

// Azure OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `https://${process.env.AZURE_OPENAI_RESOURCE_NAME}.openai.azure.com/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { 'api-version': '2023-05-15' },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY }
});

// Neo4j database setup
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

// GraphRAG class
class GraphRAG {
  constructor(driver) {
    this.driver = driver;
  }

  // Function initializes schema with constraints and indexes
  async initializeSchema() {
    const session = this.driver.session();
    try {
      // Execute a Cypher query to create a uniqueness constraint if it doesn't exist
      await session.run(`
        CREATE CONSTRAINT unique_node IF NOT EXISTS 
        FOR (n:Content) 
        REQUIRE n.id IS UNIQUE
      `);
      await session.run(`
        CREATE INDEX FOR (n:Content) ON (n.type)
      `);
      await session.run(`
        CREATE INDEX FOR (n:Content) ON (n.url)
      `);
      
      console.log('Graph schema initialized with constraints and indexes');
    } catch (error) {
      console.error('Error initializing schema:', error);
    } finally {
      await session.close();
    }
  }

  // Function adds user node
  async ingestContent(content) {
    const session = this.driver.session();
    const nodeBatchSize = 100;
    const relBatchSize = 50;
    
    try {
      // Filter and prepare content
      const validContent = content.filter(item => 
        item && item.text && typeof item.text === 'string' && 
        item.text.length > 10 && ['h1','h2','h3','h4','p','li'].includes(item.type)
      ).map(item => ({
        ...item,
        id: `${item.url}-${item.text.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`
      }));

      console.log(`Processing ${validContent.length} valid items`);

      // Create nodes first
      for (let i = 0; i < validContent.length; i += nodeBatchSize) {
        const batch = validContent.slice(i, i + nodeBatchSize);
        await session.run(`
          UNWIND $batch AS item
          MERGE (n:Content {id: item.id})
          SET n.text = item.text,
              n.type = item.type,
              n.url = item.url
        `, { batch });
      }

      // Create relationships
      const headingContent = validContent.filter(item => 
        ['h1', 'h2', 'h3', 'h4'].includes(item.type)
      );

      for (let i = 0; i < headingContent.length; i += relBatchSize) {
        const batch = headingContent.slice(i, i + relBatchSize);
        await session.run(`
          UNWIND $batch AS item
          MATCH (n:Content {id: item.id})
          MATCH (other:Content)
          WHERE other.url = n.url // Same page only
          AND other.type IN ['p', 'li'] // Only link to paragraphs/lists
          AND other.text CONTAINS n.text 
          AND size(n.text) > 5 // Minimum text length
          AND id(other) <> id(n)
          MERGE (n)-[:RELATED_TO {context: 'section'}]->(other)
        `, { batch });
      }
    } catch (error) {
      console.error('Error ingesting content:', error);
    } finally {
      await session.close();
    }
  }

  // Function queries related concepts in the graph
  async queryRelatedConcepts(query) {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (n:Content)-[r:RELATED_TO]->(m:Content)
        WHERE n.text CONTAINS $query OR m.text CONTAINS $query
        WITH n, r, m, 
             apoc.text.jaroWinklerDistance(
               apoc.text.clean(n.text), 
               apoc.text.clean(m.text)
             ) AS similarity
        WHERE similarity > 0.6
        RETURN n.text AS source, 
               r.context AS relationship, 
               m.text AS target,
               n.url AS sourceUrl,
               m.url AS targetUrl,
               similarity
        ORDER BY similarity DESC
        LIMIT 10
      `, { query });
      
      return result.records.map(record => ({
        source: record.get('source'),
        relationship: record.get('relationship') || 'related',
        target: record.get('target'),
        sourceUrl: record.get('sourceUrl'),
        targetUrl: record.get('targetUrl'),
        confidence: record.get('similarity').toFixed(2)
      }));
    } catch (error) {
      console.error('Error querying graph:', error);
      return [];
    } finally {
      await session.close();
    }
  }
}

// Initialize GraphRAG with optimizations
const graphRAG = new GraphRAG(neo4jDriver);
graphRAG.initializeSchema();

// Cache for scraped content
let websiteContentCache = [];

// Function for the web scraper
async function scrapeWebsite() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  // Fake user agent to avoid bot detection
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  const BASE_URL = 'https://www.madewithnestle.ca';
  const MAX_PAGES = 950;
  const visitedUrls = new Set();
  const scrapedData = [];
  const queue = [BASE_URL];

  // Function filters out unwanted recipe tags and social media links
  function shouldCrawl(url) {
    const isFilterPage = url.includes('recipes?f%5B') || 
                        url.includes('recipe_tags_filter');
    
    return url.startsWith(BASE_URL) &&
           !isFilterPage &&
           !url.includes('#') &&
           !url.includes('facebook.com') &&
           !url.includes('twitter.com') &&
           !visitedUrls.has(url);
  }

  // Function prioritizes recipe links
  function prioritizeLinks(links) {
    return links.sort((a, b) => {
      if (a.includes('/recipe/')) return -1;
      if (b.includes('/recipe/')) return 1;
      return 0;
    });
  }

  // Function extracts page content
  async function extractPageContent(url) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const pageContent = await page.content();
      scrapedData.push({ url, html: pageContent });

      // Waits for dynamic content to load
      if (url.includes('/recipe/')) {
        await page.waitForSelector('h1, h2, p', { timeout: 8000 });
      }
      // Extract content from the page
      return await page.evaluate((currentUrl) => {
        const data = [];
        const selectors = ['h1', 'h2', 'h3', 'h4', 'p', 'li', 'span'];

        // Extract text content
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => {
            const text = (el.textContent || '').trim();
            if (text && text.length > 10) {
              data.push({
                type: selector,
                text: text,
                url: currentUrl
              });
            }
          });
        });

        // Extract images
        document.querySelectorAll('img').forEach(el => {
          const src = el.src || el.getAttribute('data-src');
          if (src && typeof src === 'string') {
            data.push({
              type: 'image',
              text: (el.alt || '').substring(0, 200),
              url: src.startsWith('http') ? src : new URL(src, currentUrl).toString()
            });
          }
        });

        // Extract links
        document.querySelectorAll('a[href]').forEach(el => {
          const href = el.href;
          if (href && typeof href === 'string' && href.startsWith('http')) {
            data.push({
              type: 'link',
              text: (el.textContent || '').trim() || href.substring(0, 200),
              url: href
            });
          }
        });

        return data.filter(item => item.text && item.url);
      }, url);
    } catch (error) {
      console.error(`Error extracting ${url}:`, error.message);
      return [];
    }
  }

  // Main crawling loop
  while (queue.length > 0 && visitedUrls.size < MAX_PAGES) {
    const currentUrl = queue.shift();
    
    if (!shouldCrawl(currentUrl)) continue;

    console.log(`Crawling (${visitedUrls.size + 1}/${MAX_PAGES}): ${currentUrl}`);
    visitedUrls.add(currentUrl);

    try {
      // Extract content from current page
      const pageData = await extractPageContent(currentUrl);
      if (pageData && pageData.length > 0) {
        scrapedData.push(...pageData);
      }

      // Get all links from current page
      const links = await page.evaluate(() => 
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href && typeof href === 'string')
      );

      // Add prioritized links to queue
      prioritizeLinks(links).forEach(link => {
        if (shouldCrawl(link)) {
          const normalizedLink = new URL(link).toString();
          if (!queue.includes(normalizedLink)) { 
            queue.push(normalizedLink);
          }
        }
    });
    } catch (error) {
      console.error(`Error processing ${currentUrl}:`, error.message);
    }

    await new Promise(r => setTimeout(r, 1000));    // Delay to avoid bot detection
  }

  // Process results
  if (scrapedData.length > 0) {
    websiteContentCache = scrapedData;
    await graphRAG.ingestContent(scrapedData);
    console.log(`Scraped ${scrapedData.length} items from ${visitedUrls.size} pages`);
  }

  await browser.close();
  return scrapedData;
}

// Function uploads documents to Azure AI Search
async function uploadToAzureSearch(content) {
  try {
    const MAX_BATCH_SIZE = 30000; // Ensure batches fit Azure's 30k limit
    const validDocuments = content
      .filter(item => item && item.text && typeof item.text === 'string')
      .map((item, index) => ({
        "@search.action": "upload",
        id: `doc-${index}-${Date.now()}`,
        text: item.text.substring(0, 1000), // Text length limited to 1000 characters
        url: item.url,
        category: item.type || 'unknown'
      }));

    console.log(`Preparing to upload ${validDocuments.length} documents in batches`);

    // Process in batches
    for (let i = 0; i < validDocuments.length; i += MAX_BATCH_SIZE) {
      const batch = validDocuments.slice(i, i + MAX_BATCH_SIZE);
      try {
        await searchClient.uploadDocuments(batch);
        console.log(`Uploaded batch ${Math.floor(i / MAX_BATCH_SIZE) + 1} with ${batch.length} documents`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (batchError) {
        // Continues with next batch even if one fails
        console.error(`Error uploading batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}:`, batchError.message);
      }
    }

    console.log(`Finished uploading ${validDocuments.length} documents to Azure Search`);
  } catch (error) {
    console.error('Azure Search upload failed:', error.message);
    throw error;
  }
}

// Initialize services with retry logic
async function initializeServices() {
  let retries = 3;
  
  while (retries > 0) {
    try {
      await ensureSearchIndex();
      const content = await scrapeWebsite();
      if (content.length > 0) {
        await uploadToAzureSearch(content);
      }
      console.log('Initial website scraping completed successfully');
      return;
    } catch (error) {
      retries--;
      console.error(`Initialization error (${retries} retries left):`, error.message);
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

setTimeout(initializeServices, 2000);

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  console.log('Received chat request');
  const { message, userId } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  try {
    console.log('Processing message:', message);
    
    // Search with Azure AI Search
    const searchResults = await searchClient.search(message, { 
      top: 3,
      queryType: 'simple',
      highlightFields: 'text'
    });
    
    // Process search results
    const searchContent = [];
    for await (const result of searchResults.results) {
      searchContent.push({
        text: result.document.text,
        url: result.document.url,
        highlights: result.highlights?.text?.join('...') || ''
      });
    }
    
    // Query the knowledge graph
    const graphData = await graphRAG.queryRelatedConcepts(message);
    
    // Generate an AI response with context
    const context = [
      ...searchContent.map(doc => `Relevant content (from ${doc.url}): ${doc.highlights || doc.text.substring(0, 200)}`),
      ...graphData.map(rel => `Related concept: ${rel.source} (${rel.sourceUrl}) ${rel.relationship} ${rel.target} (${rel.targetUrl})`)
    ].join('\n\n');
    
    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      messages: [
        { 
          role: 'system', 
          content: `You are Smartie, an AI assistant for the Made With Nestlé website. 
          Provide helpful, accurate responses based on the website content. Be friendly and professional.
          Always include URLs when referencing specific content. If you're not sure, say so rather than guessing.` 
        },
        { 
          role: 'user', 
          content: `Question: ${message}\n\nContext:\n${context}` 
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });
    
    res.json({ 
      response: completion.choices[0].message.content,
      sources: [
        ...searchContent.map(item => ({
          text: item.text.substring(0, 200) + '...',
          url: item.url
        })),
        ...graphData.map(item => ({
          text: `${item.source} ${item.relationship} ${item.target}`,
          url: item.sourceUrl || item.targetUrl
        }))
      ]
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: "Sorry, I'm having trouble finding that information. Please try again later.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enpoint for adding user nodes to the graph
app.post('/api/graph/add-node', async (req, res) => {
  const { userId, text, type, url } = req.body;
  
  if (!userId || !text) {
    return res.status(400).json({ error: 'userId and text are required' });
  }
  
  try {
    const newNode = await graphRAG.addUserNode(userId, { text, type, url });
    res.json(newNode);
  } catch (error) {
    console.error('Error adding node:', error);
    res.status(500).json({ error: 'Failed to add node' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check service connectivity
    const neo4jStatus = await neo4jDriver.verifyConnectivity();
    // Try a simple query to Azure Search to test connectivity
    const searchResults = await searchClient.search("*", { top: 1 });
    // check if searchResults is iterable
    let azureSearchConnected = false;
    for await (const _ of searchResults) {
      azureSearchConnected = true;
      break;
    }

    res.json({
      status: 'healthy',
      port: PORT,
      cacheSize: websiteContentCache.length,
      lastScrape: websiteContentCache.length > 0 ? new Date().toISOString() : 'never',
      neo4j: neo4jStatus ? 'connected' : 'disconnected',
      azureSearch: azureSearchConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'degraded',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await neo4jDriver.close();
  process.exit();
});