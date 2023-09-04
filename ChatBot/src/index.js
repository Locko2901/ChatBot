const { OpenAI } = require('openai');
const express = require('express');
const bodyParser = require('body-parser');
const { EventEmitter } = require('events');
const cors = require('cors');

const app = express();
const port = 4000;

const eventEmitter = new EventEmitter();

const maxTotalTokens = 4096; 
const bufferTokens = 800;
const safety = 100;

let personalityPrompt = `
  You are a Bot. 
`; // Set PersonalityPrompt

// Set prompts to add to PersonalityPrompt when usernamedetection
const creatorIntroduction = `Sample`;
const creatorgfIntroduction = `Sample!`

let chatPrompt = personalityPrompt;

let sharedConversationHistory = [];

app.use(bodyParser.json());
app.use(cors());

const openaiAPIKey = 'Your-Api-Key'; // Replace with your actual OpenAI API key
const openai = new OpenAI({ apiKey: openaiAPIKey });

const countTokens = (messages) => {
  return messages.reduce((totalTokens, message) => {
    if (message.content) {
      return totalTokens + message.content.split(' ').length;
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

app.post('/userMessage', async (req, res) => {
  const userMessage = req.body.userQuery;

  const username = userMessage.split(':')[0];
  const messageContent = userMessage.split(':')[1];

  console.log('Username:', username);
  console.log('User Message:', messageContent);

  // Set usernames you want the bot to recognize
  if (username === 'ExampleName') {
    chatPrompt = personalityPrompt.replace(creatorgfIntroduction + '\n', '');
    if (!chatPrompt.includes(creatorIntroduction)) {
      chatPrompt += '\n' + creatorIntroduction;
    }
  } else if (username === 'ExampleName1') {
    chatPrompt = personalityPrompt.replace(creatorIntroduction + '\n', '');
    if (!chatPrompt.includes(creatorgfIntroduction)) {
      chatPrompt += '\n' + creatorgfIntroduction;
    }
  } else {
    chatPrompt = personalityPrompt
      .replace(creatorIntroduction + '\n', '')
      .replace(creatorgfIntroduction + '\n', '');
  }

  console.log('Prompt:', chatPrompt);

  const messageBatches = splitLongMessages(messageContent);

  const personalityPromptTokens = countTokens([{ content: chatPrompt }]);

  const userMessageHistory = sharedConversationHistory.filter((message) => message.role === 'user');
  const assistantMessageHistory = sharedConversationHistory.filter((message) => message.role === 'assistant');

  let userMessageTokens = countTokens(userMessageHistory);
  let assistantMessageTokens = countTokens(assistantMessageHistory);

  const availableTokens = maxTotalTokens - personalityPromptTokens - userMessageTokens - assistantMessageTokens;

  messageBatches.forEach((batch) => {
    const currentMessageTokens = countTokens([{ content: batch }]);

    console.log('Current Message Tokens:', currentMessageTokens);
    console.log('User Message Tokens:', userMessageTokens);
    console.log('Assistant Message Tokens:', assistantMessageTokens);
    console.log('Available Tokens:', availableTokens);

    while (currentMessageTokens + userMessageTokens + assistantMessageTokens > maxConvTokens) {
      if (userMessageTokens > assistantMessageTokens) {
        const removedMessage = userMessageHistory.shift();
        userMessageTokens -= countTokens([{ content: removedMessage.content }]);
      } else {
        const removedMessage = assistantMessageHistory.shift();
        assistantMessageTokens -= countTokens([{ content: removedMessage.content }]);
      }
    }

    userMessageHistory.push({ role: 'user', username: username, content: batch });
    userMessageTokens += currentMessageTokens;

    console.log('User Message History:', userMessageHistory);
    console.log('User Message Tokens After Adding:', userMessageTokens);
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

    console.log('Assistant Message History:', assistantMessageHistory);
    console.log('Assistant Message Tokens After Adding:', assistantMessageTokens);
    console.log('Chatbot Response:', response);
  });

  sharedConversationHistory = [...userMessageHistory, ...assistantMessageHistory];

  res.json({ message: 'Message received by the server.', chatbotResponse: chatbotResponses });
});

async function generateResponses(messageBatches, userMessageHistory, assistantMessageHistory) {
  const responses = [];

  for (const batch of messageBatches) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: chatPrompt },
          ...userMessageHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...assistantMessageHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: batch },
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get('/', (req, res) => {
  res.send('Hello, World!');
});