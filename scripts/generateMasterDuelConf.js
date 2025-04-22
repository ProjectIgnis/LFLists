const fs = require("fs");
const path = require("path");
const core = require("@actions/core");
const { eachDayOfInterval, format } = require("date-fns");

const CARD_LIST_URI = "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=Master%20Duel";
const BAN_LIST_URI = "https://ygoprodeck.com/api/banlist/getBanList.php?list=Master%20Duel&date=";

const confPath = path.join(__dirname, "../MasterDuel.lflist.conf");
async function main() {
  if (!fs.existsSync(confPath)) {
    // Default to the last valid banlist at time of script creation if no conf file exists
    fs.writeFileSync(confPath, `#[2025.04.10 Master Duel]\n!2025.04.10 Master Duel\n$whitelist\n`);
  }

  // check for banlist changes
  let changeNeeded = false;
  const runTimeDateStr = format(new Date(), "yyyy.MM.dd");
  core.setOutput("run_time_date", runTimeDateStr);
  const lastConf = fs.readFileSync(confPath, "utf8");
  const lastConfDateLine = lastConf.split("\n").find((line) => line.startsWith("!"));

  const lastConfDate = lastConfDateLine ? lastConfDateLine.split(" ")[0].substring(1) : null;

  if (!lastConfDate) {
    core.summary.addRaw("There is an issue with the existing .conf file. Please check the file and try again.").write();
    core.setFailed("There is an issue with the existing .conf file. Please check the file and try again.");
    return;
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

  for (const card of currentCardList) {
    if (!lastConf.includes(card.id)) {
      changeNeeded = true;
      break;
    }
  }

  // determine last valid banlist date
  let currentBanList = [];
  let currentBanListDate = "";
  const datesBetween = eachDayOfInterval({ start: new Date(runTimeDateStr), end: new Date(lastConfDate) }).map((date) => format(date, "yyyy.MM.dd"));
  for (const date of datesBetween) {
    const banListUrl = `${BAN_LIST_URI}${date}`;

    const banListResponse = await fetch(banListUrl);

    if (!banListResponse.ok) {
      continue;
    }

    const banListData = await banListResponse.json();
    if (!banListData || !Array.isArray(banListData) || banListData.length === 0) {
      continue;
    }

    currentBanList = banListData;
    currentBanListDate = date;

    if (date !== lastConfDate) {
      changeNeeded = true;
    }

    break;
  }

  if (!changeNeeded) {
    core.summary.addRaw("No changes to the card list or banlist detected. Bye, Bye.").write();
    return;
  }

  // create new conf file
  fs.writeFileSync(confPath, `#[${currentBanListDate} Master Duel]\n!${currentBanListDate} Master Duel\n$whitelist\n`);
  const unlimitedCards = [];
  const limitedCards = [];
  const semiLimitedCards = [];
  const forbiddenCards = [];

  for (const card of currentCardList) {
    const banListEntry = currentBanList.find((cardData) => cardData.id === card.id);
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

  core.summary.addRaw("Conf file updated").write();
  const changesSummary = [
    "### Changes Summary",
    `**Banlist Date:** ${currentBanListDate}`,
    "",
    "**Forbidden Cards:**",
    ...forbiddenCards.map((c) => `- ${c.name} (${c.id})`),
    "",
    "**Limited Cards:**",
    ...limitedCards.map((c) => `- ${c.name} (${c.id})`),
    "",
    "**Semi-Limited Cards:**",
    ...semiLimitedCards.map((c) => `- ${c.name} (${c.id})`),
    "",
    "**Unlimited Cards:**",
    ...unlimitedCards.map((c) => `- ${c.name} (${c.id})`),
  ].join("\n");

  core.setOutput("changes_summary", changesSummary);
  core.summary.addRaw(changesSummary).write();
}

main().catch((error) => {
  core.setFailed(error.message);
});
