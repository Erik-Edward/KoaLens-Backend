#!/bin/bash
# Bash-skript för att testa KoaLens API-endpointerna

# ANSI färgkoder
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}KoaLens API Endpoint Test${NC}"

API_BASE="http://localhost:3000/api"

# Testa health-endpoint först
echo -e "\n${YELLOW}Testar health endpoint...${NC}"
health_response=$(curl -s "$API_BASE/health")
echo $health_response | jq '.'

if [ $? -ne 0 ]; then
  echo -e "${RED}Fel vid anrop till health endpoint. Servern kanske inte körs?${NC}"
  echo -e "${YELLOW}Starta servern med 'npm run dev' och försök igen.${NC}"
  exit 1
fi

# Testa bildanalys-endpointen
echo -e "\n${YELLOW}Testar /api/ai/analyze-image endpoint...${NC}"
image_response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "preferredLanguage":"en"}' \
  "$API_BASE/ai/analyze-image")

if [[ $image_response == *"error"* ]]; then
  echo -e "${RED}Bildanalys-endpointen svarade med ett fel:${NC}"
  echo $image_response | jq '.'
else
  echo -e "${GREEN}Bildanalys-endpointen svarade:${NC}"
  echo $image_response | jq '.'
fi

# Testa textanalys-endpointen
echo -e "\n${YELLOW}Testar /api/ai/analyze-text endpoint...${NC}"
text_response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"ingredients":["milk", "sugar", "flour", "salt"]}' \
  "$API_BASE/ai/analyze-text")

if [[ $text_response == *"error"* ]]; then
  echo -e "${RED}Textanalys-endpointen svarade med ett fel:${NC}"
  echo $text_response | jq '.'
else
  echo -e "${GREEN}Textanalys-endpointen svarade:${NC}"
  echo $text_response | jq '.'
fi

echo -e "\n${CYAN}Test genomfört!${NC}" 