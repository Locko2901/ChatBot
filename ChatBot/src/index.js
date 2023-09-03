const { OpenAI } = require('openai');
const express = require('express');
const bodyParser = require('body-parser');
const { EventEmitter } = require('events');
const cors = require('cors');

const app = express();
const port = 4000;

const eventEmitter = new EventEmitter();

const maxTotalTokens = 4096; 

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

  messageBatches.forEach((batch) => {
    const currentMessageTokens = countTokens([{ content: batch }]);

    const personalityPromptTokens = countTokens([{ content: chatPrompt }]);

    const historyTokens = countTokens(sharedConversationHistory);

    const availableTokens = maxTotalTokens - historyTokens - personalityPromptTokens - 100;

    console.log('Current Message Tokens:', currentMessageTokens);
    console.log('History Tokens:', historyTokens);
    console.log('Available Tokens:', availableTokens);

    if (currentMessageTokens > availableTokens) {
      while (countTokens(sharedConversationHistory) + currentMessageTokens > maxTotalTokens) {
        const removedMessage = sharedConversationHistory.shift();
        console.log('Removing Message from Conversation History:', removedMessage.content);
      }
    }

    sharedConversationHistory.push({ role: 'user', username: username, content: batch });
    console.log('Conversation History:', sharedConversationHistory);
    console.log('Conversation History Tokens:', countTokens(sharedConversationHistory));
  });

  eventEmitter.emit('userMessage', { userAttribution: 'user', userQuery: messageContent });

  const chatbotResponses = await generateResponses(messageBatches);

  chatbotResponses.forEach((response) => {
    const responseTokens = countTokens([{ content: response }]);

    const historyTokensAfterResponse = countTokens(sharedConversationHistory) + responseTokens;

    console.log('Response Tokens:', responseTokens);
    console.log('History Tokens After Response:', historyTokensAfterResponse);

    while (historyTokensAfterResponse > maxTotalTokens) {
      const removedMessage = sharedConversationHistory.shift();
      console.log('Removing Message from Conversation History:', removedMessage.content);
      historyTokensAfterResponse = countTokens(sharedConversationHistory) + responseTokens;
    }

    sharedConversationHistory.push({ role: 'assistant', content: response });
    console.log('Conversation History Tokens After Response:', historyTokensAfterResponse);
    console.log('Chatbot Response:', response);
  });

  res.json({ message: 'Message received by the server.', chatbotResponse: chatbotResponses });
});

app.post('/assistantResponse', (req, res) => {
  const assistantResponse = req.body.assistantResponse;

  res.json({ message: 'Response received by the server.' });
});

async function generateResponses(messageBatches) {
  const responses = [];

  for (const batch of messageBatches) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: chatPrompt },
          ...sharedConversationHistory.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        temperature: 0.7,
        max_tokens: 1500, 
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