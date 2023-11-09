const fs = require('fs');

function saveConversationHistoryToFile(history) {
  fs.writeFileSync('conversation_history.json', JSON.stringify(history), 'utf8');
}

function loadConversationHistoryFromFile() {
  try {
    const data = fs.readFileSync('conversation_history.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Function to prune old messages to limit the size or message count
function pruneConversationHistory(history, maxSize, maxMessageCount) {
  if (history.length > maxMessageCount) {
    history.splice(0, history.length - maxMessageCount);
  }

  let historySize = JSON.stringify(history).length;

  while (historySize > maxSize) {
    history.shift();
    historySize = JSON.stringify(history).length;
  }
}

module.exports = {
  saveConversationHistoryToFile,
  loadConversationHistoryFromFile,
  pruneConversationHistory,
};
