const { OpenAI } = require('openai');
const express = require('express');
const bodyParser = require('body-parser');
const { EventEmitter } = require('events');
const cors = require('cors');
const {
  saveConversationHistoryToFile,
  loadConversationHistoryFromFile,
  pruneConversationHistory,
} = require('./conversationHistory');

const app = express();
const port = 4000;

const eventEmitter = new EventEmitter();

let sharedConversationHistory = loadConversationHistoryFromFile();

// Define the maximum history size and maximum message count
const maxHistorySize = 10 * 1024 * 1024; // Maximum size in bytes (e.g., 10 MB)
const maxMessageCount = 1000; // Maximum number of messages

pruneConversationHistory(sharedConversationHistory, maxHistorySize, maxMessageCount);

const maxTotalTokens = 4096; 
const maxConvTokens = 3020;

let personalityPrompt = `
  You are a Bot. 
`; // Set PersonalityPrompt

// Set prompts to add to PersonalityPrompt when usernamedetection
const creatorIntroduction = `Sample`;
const creatorgfIntroduction = `Sample!`

let chatPrompt = personalityPrompt;

app.use(bodyParser.json());
app.use(cors());

const openaiAPIKey = 'Your-Api-Key'; // Replace with your actual OpenAI API key
const openai = new OpenAI({ apiKey: openaiAPIKey });

const countTokens = (messages) => {
  return messages.reduce((totalTokens, message) => {
    if (message.content) {
      const tokenCount = message.content.split(' ').length; 
      return totalTokens + tokenCount;
    }
    return totalTokens;
  }, 0);
};

const splitLongMessages = (messageContent) => {
  const maxLength = 2000;
  const messageBatches = [];
  let currentMessage = '';

  messageContent.split('\n').forEach((line) => {
    if (currentMessage.length + line.length <= maxLength) {
      currentMessage += line + '\n';
    } else {
      messageBatches.push(currentMessage);
      currentMessage = line + '\n';
    }
  });

  if (currentMessage.length > 0) {
    messageBatches.push(currentMessage);
  }

  return messageBatches;
};

let userPrompts = {}; 
let userPrompt;

app.post('/userMessage', async (req, res) => {
  const userMessage = req.body.userQuery;
  const server = req.body.server;
  const username = userMessage.split(':')[0];
  let messageContent = userMessage.split(':')[1];

  console.log('Username:', username);
  console.log('User Message:', messageContent);
  console.log('Server', server);

  if (!userPrompts[username]) {
    userPrompts[username] = personalityPrompt;
  }

  userPrompt = userPrompts[username];

  if (username === 'Examplename') { //Select username 
    if (!userPrompt.includes(creatorIntroduction)) {
      userPrompt += '\n' + creatorIntroduction;
    }
  } else if (username === 'Examplename1') { //select username
    if (!userPrompt.includes(creatorgfIntroduction)) {
      userPrompt += '\n' + creatorgfIntroduction;
    }
  }

  console.log('Prompt:', userPrompt);

  const messageBatches = splitLongMessages(messageContent);

  const personalityPromptTokens = countTokens([{ content: userPrompt }]);

  const userMessageHistory = sharedConversationHistory.filter((message) => message.role === 'user');
  const assistantMessageHistory = sharedConversationHistory.filter((message) => message.role === 'assistant');

  let userMessageTokens = countTokens(userMessageHistory);
  let assistantMessageTokens = countTokens(assistantMessageHistory);

  const availableTokens = maxTotalTokens - personalityPromptTokens - userMessageTokens - assistantMessageTokens;

  messageBatches.forEach((batch) => {
    const currentMessageTokens = countTokens([{ content: batch }]);

    while (currentMessageTokens + userMessageTokens + assistantMessageTokens > maxConvTokens) {
      if (userMessageTokens > assistantMessageTokens) {
        const removedMessage = userMessageHistory.shift();
        userMessageTokens -= countTokens([{ content: removedMessage.content }]);
      } else {
        const removedMessage = assistantMessageHistory.shift();
        assistantMessageTokens -= countTokens([{ content: removedMessage.content }]);
      }
    }

    userMessageHistory.push({ role: 'user', username: username, server: server, content: batch });
    userMessageTokens += currentMessageTokens;
  });

  sharedConversationHistory = [...userMessageHistory, ...assistantMessageHistory];

  eventEmitter.emit('userMessage', { userAttribution: 'user', userQuery: messageContent });

  const chatbotResponses = await generateResponses(messageBatches, userMessageHistory, assistantMessageHistory);

  chatbotResponses.forEach((response) => {
    const responseTokens = countTokens([{ content: response }]);

    while (responseTokens + userMessageTokens + assistantMessageTokens > maxConvTokens) {
      if (userMessageTokens > assistantMessageTokens) {
        const removedMessage = userMessageHistory.shift();
        userMessageTokens -= countTokens([{ content: removedMessage.content }]);
      } else {
        const removedMessage = assistantMessageHistory.shift();
        assistantMessageTokens -= countTokens([{ content: removedMessage.content }]);
      }
    }

    assistantMessageHistory.push({ role: 'assistant', content: response });
    assistantMessageTokens += responseTokens;
  });

  sharedConversationHistory = [...userMessageHistory, ...assistantMessageHistory];

  saveConversationHistoryToFile(sharedConversationHistory);

  res.json({ message: 'Message received by the server.', chatbotResponse: chatbotResponses });
});

async function generateResponses(messageBatches, userMessageHistory, assistantMessageHistory) {
  const responses = [];

  for (const batch of messageBatches) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          ...userMessageHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...assistantMessageHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: batch },
          { role: 'system', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 750,
      });

      responses.push(response.choices[0].message.content);
    } catch (error) {
      console.error('Error generating response:', error.message);
      responses.push('An error occurred while generating a response.');
    }
  }

  return responses;
}

https.createServer(serverOptions, app).listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get('/', (req, res) => {
  res.send('Hello, World!');
});
