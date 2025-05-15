const neo4j = require('neo4j-driver');

class GraphRAG {
  constructor(uri, username, password) {
    // Create a driver instance to connect to the Neo4j database
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }

  // Initialize the database schema
  async initializeSchema() {
    const session = this.driver.session();    // Start new session
    try {
      // Ensure nodes have unique IDs
      await session.run(`
        CREATE CONSTRAINT unique_node IF NOT EXISTS 
        FOR (n:Content) 
        REQUIRE n.id IS UNIQUE
      `);
      console.log('Graph schema initialized');
    } catch (error) {
      console.error('Error initializing schema:', error);
    } finally {
      await session.close();
    }
  }

  // Add content to the database
  async ingestContent(content) {
    const session = this.driver.session();
    const batchSize = 100;  // Batches of 100 to avoid memory issues
    
    try {
      for (let i = 0; i < content.length; i += batchSize) {
        const batch = content.slice(i, i + batchSize);  // Get current batch
        // Prepare the query to create nodes and relationships
        const query = `
          UNWIND $batch AS item
          MERGE (n:Content {id: item.url + '-' + item.text.substring(0, 50)})
          SET n.text = item.text,
              n.type = item.type,
              n.url = item.url
          WITH n, item
          WHERE item.type IN ['h1', 'h2', 'h3', 'h4']
          MATCH (other:Content)
          WHERE other.text CONTAINS n.text AND id(other) <> id(n)
          MERGE (n)-[:RELATED_TO]->(other)
        `;
        
        await session.run(query, { batch });
        console.log(`Processed batch ${i / batchSize + 1}`);
      }
    } catch (error) {
      console.error('Error ingesting content:', error);
    } finally {
      await session.close();
    }
  }

  // Query the graph for related concepts
  async queryRelatedConcepts(query) {
    const session = this.driver.session();
    try {
      // Search for relationships where either node contains the query text
      const result = await session.run(`
        MATCH (n:Content)-[r]->(m:Content)
        WHERE n.text CONTAINS $query OR m.text CONTAINS $query
        RETURN n.text AS source, type(r) AS relationship, m.text AS target
        LIMIT 10
      `, { query });
      
      return result.records.map(record => ({
        source: record.get('source'),
        relationship: record.get('relationship'),
        target: record.get('target')
      }));
    } catch (error) {
      console.error('Error querying graph:', error);
      return [];
    } finally {
      await session.close();
    }
  }

  // Add a user-defined nodes and relationships
  async addUserDefinedNode(userId, nodeData, relationships) {
    const session = this.driver.session();
    try {
      // Create or find the user node
      await session.run(`
        MERGE (u:User {id: $userId})
      `, { userId });
      
      // Create a content node connected to the user
      const result = await session.run(`
        MATCH (u:User {id: $userId})
        CREATE (n:Content:UserDefined {
          id: $nodeId,
          text: $text,
          type: 'user_defined',
          createdBy: $userId,
          createdAt: datetime()
        })
        CREATE (u)-[:CREATED]->(n)
        RETURN id(n) AS nodeId
      `, { 
        userId,
        // Generate a unique node ID
        nodeId: `user-${userId}-${Date.now()}`,
        text: nodeData.text 
      });
      
      const nodeId = result.records[0].get('nodeId');
      
      // Create relationships to other nodes
      for (const rel of relationships) {
        await session.run(`
          MATCH (source) WHERE id(source) = $nodeId
          MATCH (target:Content {id: $targetId})
          CREATE (source)-[:${rel.type} {weight: $weight}]->(target)
        `, { 
          nodeId, 
          targetId: rel.targetId,
          weight: rel.weight || 1.0
        });
      }
      
      return { success: true, nodeId };
    } catch (error) {
      console.error('Error adding user node:', error);
      return { success: false, error: error.message };
    } finally {
      await session.close();
    }
  }
}

// GraphRAG class is exported for use in other files
module.exports = GraphRAG;