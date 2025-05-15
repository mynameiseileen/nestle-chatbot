#!/bin/bash

az webapp config appsettings set \
  --name nestle-chatbot-backend \
  --resource-group nestle \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    FRONTEND_URL="https://ambitious-island-06ab78d0f.6.azurestaticapps.net" \
    AZURE_SEARCH_SERVICE_NAME="nestle-search-eileen1" \
    AZURE_SEARCH_INDEX_NAME="nestle-content" \
    AZURE_SEARCH_API_KEY="RH8vZGmhpf9qIX8wIhzLGgQfmISqQQq0BzAPs3K4QJAzSeDk3Fmp" \
    AZURE_OPENAI_RESOURCE_NAME="nestle-openai-eileen1" \
    AZURE_OPENAI_API_KEY="6fWe9f9h7smbGens9vC8JxdPF62X7W5GmIuGWom7sO7X9VAF9Mg4JQQJ99BEACHYHv6XJ3w3AAABACOGYsYL" \
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4" \
    NEO4J_URI="neo4j+s://02149df0.databases.neo4j.io" \
    NEO4J_USERNAME="neo4j" \
    NEO4J_PASSWORD="Tikc3124DWuxWnWpEf37EljWloxd5PJf7a5y-xof_TU"
