const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const EventEmitter = require('events');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const serverUserMessageEndpoint = 'http://localhost:4000/userMessage'; 
const serverAssistantResponseEndpoint = 'http://localhost:4000/assistantResponse'; 

const eventEmitter = new EventEmitter();

const messageQueue = [];
let isProcessing = false;

client.on('ready', () => {
    console.log(`${client.user.tag} is online.`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) {
        return;
    }

    const targetContent = 'ExampleBot'; // Replace with your bot's name
    const lowerCaseMessage = message.content.toLowerCase();

    if (lowerCaseMessage.includes(targetContent.toLowerCase()) || message.mentions.has(client.user)) {
        if (message.mentions.everyone || message.mentions.here) {
            return;
        }

        const messageContent = `${message.author.username}:${message.content}`;

        const data = {
            userQuery: messageContent,
            server: message.guild.name, 
        };

        messageQueue.push({ message, data });

        if (!isProcessing) {
            processNextMessage();
        }
    }
});

async function processNextMessage() {
    if (messageQueue.length > 0) {
        isProcessing = true;
        const { message, data } = messageQueue.shift();

        try {
            message.channel.sendTyping();
            const response = await axios.post(serverUserMessageEndpoint, data);
            const serverResponses = response.data.chatbotResponse;
            console.log('Server Responses:', serverResponses);

            for (const serverResponse of serverResponses) {
                if (serverResponse.trim() !== '') {
                    const responseParts = splitLongMessage(serverResponse);
                    for (const part of responseParts) {
                        await message.reply(part);
                    }
                }
            }
        } catch (error) {
            console.error('Error sending/receiving messages:', error.message);
            message.reply('An error occurred while communicating with the server.');
        }

        isProcessing = false;
        processNextMessage(); 
    }
}

eventEmitter.on('botResponse', async (responseData) => {
    const responseBatch = responseData.responseBatch;

    try {
        const responseParts = splitLongMessage(responseBatch);
        for (const part of responseParts) {
            await responseData.message.reply(part);
        }
    } catch (error) {
        console.error('Error sending message:', error.message);
    }
});

function splitLongMessage(message) {
    const maxLength = 1000;
    const parts = [];

    const sentences = message.split('. '); 
    let currentPart = '';

    for (const sentence of sentences) {
        if (currentPart.length + sentence.length + 2 <= maxLength) {
            if (currentPart !== '') {
                currentPart += '. ';
            }
            currentPart += sentence;
        } else {
            parts.push(currentPart);
            currentPart = sentence;
        }
    }

    if (currentPart !== '') {
        parts.push(currentPart);
    }

    return parts;
}

client.login("Your-Bot-Token"); // Replace with your Discord bot token
