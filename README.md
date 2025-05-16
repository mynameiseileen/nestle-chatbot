# Nestlé AI Chatbot
This in an AI Chatbot named Smartie that's made for madewithnestle.ca. It provides the user with recipe recommendations and product information using content scraped from madewithnestle.ca.


## Prerequisites
- Node.js v18
- Neoj AuraDB credentials
- Azure account with AI Search service endpoint + key
- Azure account with OpenAI service endpoint + key


## Steps to Set Up
1. Clone this repository.
2. Go to the "nestle-chatbot" directory in your system's terminal.

### Backend Set Up
1. In terminal, run "cd backend".
2. Create an ".env" file inside the backend folder.
3. Edit and add credentials to .env: 
PORT=3001

AZURE_SEARCH_SERVICE_NAME=
AZURE_SEARCH_INDEX_NAME=
AZURE_SEARCH_API_KEY=

AZURE_OPENAI_RESOURCE_NAME=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT_NAME=

NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=

SCRAPE_BASE_URL=
SCRAPE_INTERVAL_MINUTES=

FRONTEND_URL=http://localhost:3000

WEBSITE_NODE_DEFAULT_VERSION=16-lts
SCM_DO_BUILD_DURING_DEPLOYMENT=true

4. In terminal, run "npm install" to install the dependencies.
5. In terminal, run "npm start" to start the backend for this chatbot.

### Frontend Set Up
1. In a separate terminal, navigate to this project's directory.
2. In terminal, run "cd frontend".
3. Create a ".env" file inside the frontend folder.
4. Add "REACT_APP_API_URL=http://localhost:3001" to the .env file. 
5. In terminal, run "npm install" to install dependencies.
6. In terminal, run "npm start" to start the frontend for this chatbot. 

The chatbot will now be running locally at: **http://localhost:3001**.


## Technologies and Frameworks
- **Frontend**: React.js, Material UI
- **Backend**: Node.js, Express, Puppeteer, CORS
- **Azure**: OpenAI Service, AI Search, Web App Service
- **Database**: Neo4j Graph Database

## Known Limitations
My current Azure OpenAI resource is limited to 1,000 tokens per minute. This is quite low as this includes both the input message and the model's output. Due to this, the chatbot will only be able to respond to one question every 1-2 minutes, depending on the message and response complexity. To increase the chatbot's throughput, a quota increase would have to submitted to Azure support. This limitation only applies to my current Azure web deployment.