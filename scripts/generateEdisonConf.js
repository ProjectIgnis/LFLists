const fs = require("fs");
const path = require("path");

const CARD_LIST_URI = "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=Edison";
const BAN_LIST_URI = "https://ygoprodeck.com/api/banlist/getBanList.php?list=TCG&date=2010-03-01";

const confPath = path.join(__dirname, "../Edison.lflist.conf");
async function main() {
  if (!fs.existsSync(confPath)) {
    // Default to the last valid banlist at time of script creation if no conf file exists
    fs.writeFileSync(confPath, `#[2010.03.01 Edison]\n!2010.03.01 Edison\n$whitelist\n`);
  }

  // fetch card list and determine if any cards have been added or removed
  const cardListResponse = await fetch(CARD_LIST_URI);

  if (!cardListResponse.ok) {
    throw new Error(`Failed to fetch card list: ${cardListResponse.statusText}`);
  }

  const cardListData = await cardListResponse.json();
  if (!cardListData || !Array.isArray(cardListData.data)) {
    throw new Error("Invalid card list data received from API");
  }

  const currentCardList = cardListData.data;

  const banListResponse = await fetch(BAN_LIST_URI);
  const banListData = await banListResponse.json();

  const unlimitedCards = [];
  const limitedCards = [];
  const semiLimitedCards = [];
  const forbiddenCards = [];

  for (const card of currentCardList) {
    const banListEntry = banListData.find((cardData) => cardData.id === card.id);
    if (banListEntry) {
      switch (banListEntry.status_text) {
        case "Forbidden":
          forbiddenCards.push(card);
          break;
        case "Limited":
          limitedCards.push(card);
          break;
        case "Semi-Limited":
          semiLimitedCards.push(card);
          break;
        default:
          break;
      }
    } else {
      unlimitedCards.push(card);
    }
  }

  const output = [
    "#Unlimited Cards",
    ...unlimitedCards.map((c) => `${c.id} 3 --${c.name}`),
    "#Semi-Limited Cards",
    ...semiLimitedCards.map((c) => `${c.id} 2 --${c.name}`),
    "#Limited Cards",
    ...limitedCards.map((c) => `${c.id} 1 --${c.name}`),
    "#Forbidden Cards",
    ...forbiddenCards.map((c) => `${c.id} 0 --${c.name}`),
  ].join("\n");

  fs.appendFileSync(confPath, "\n" + output + "\n");
}

main();
