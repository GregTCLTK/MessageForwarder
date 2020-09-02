"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const winston = require('winston');
const discord = require("discord.js");
const discord_js_1 = require("discord.js");
const http = require("http");
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(info => {
        return `${info.timestamp} [${info.level.toLocaleUpperCase()}]: ${info.message}`;
    })),
    transports: new winston.transports.Console()
});
let config = null;
let discordClient = null;
let lastEcho = null;
main();
function main() {
    if (!loadConfiguration())
        return;
    startWebServer();
    loginToDiscord();
}
function loadConfiguration() {
    if (fs.existsSync("config.json")) {
        config = JSON.parse(fs.readFileSync("config.json").toString());
    }
    else {
        logger['error']("No configuration could be found. Create a config.json file.");
        return false;
    }
    if (!config.token) {
        logger['error']("The Discord Client token is missing from the configuration file.");
        return false;
    }
    if (!config.redirects) {
        logger['error']("You have not defined any redirects. This tool is useless without them.");
        return false;
    }
    else if (!Array.isArray(config.redirects)) {
        logger['error']("The redirects are not properly formatted (missing array). Please check your configuration.");
        return false;
    }
    else if (config.redirects.length == 0) {
        logger['error']("You have not defined any redirects. This bot is useless without them.");
        return false;
    }
    else {
        for (let redirect of config.redirects) {
            if (!redirect.sources || redirect.sources.length == 0) {
                logger['error']("A redirect has no sources.");
                return false;
            }
            else if (!Array.isArray(redirect.sources)) {
                logger['error']("A redirect's sources were not formatted as an array.");
                return false;
            }
            if (!redirect.destinations || redirect.destinations.length == 0) {
                logger['error']("A redirect has no destinations.");
                return false;
            }
            else if (!Array.isArray(redirect.destinations)) {
                logger['error']("A redirect's destinations were not formatted as an array.");
                return false;
            }
            for (let source of redirect.sources) {
                for (let destination of redirect.destinations) {
                    if (source == destination) {
                        logger['error']("A redirect has a source that is the same as a destination: " + source + ". This will result in an infinite loop.");
                        return false;
                    }
                }
            }
        }
    }
    logger['info']("Configuration loaded successfully.");
    return true;
}
function startWebServer() {
    if (!process.env.PORT || isNaN(Number.parseInt(process.env.PORT)))
        return;
    logger['info']("Starting web server on port " + process.env.PORT);
    http.createServer((req, res) => {
        res.write("pong");
        res.end();
    }).listen(process.env.PORT);
}
function loginToDiscord() {
    discordClient = new discord.Client();
    discordClient.on('ready', () => {
        logger['info']("Signed into Discord.");
    });
    discordClient.on('message', onDiscordClientMessageReceived);
    discordClient.on('error', error => {
        logger['error']("An error occurred: " + error.message);
        logger['info']("Restarting Discord Client.");
        loginToDiscord();
    });
    discordClient
        .login(config.token)
        .catch(err => {
        logger['error']("Could not sign into Discord: " + err);
    });
}
function onDiscordClientMessageReceived(message) {
    let matchingRedirects = config.redirects.filter(redirect => redirect.sources.some(source => source == message.channel.id));
    matchingRedirects.forEach(redirect => {
        redirect.destinations.forEach(destination => {
            let destGuild = discordClient.guilds.resolve(destination);
            if (destGuild != null || destGuild != undefined) {
                let destChannel;
                destGuild.channels.cache.forEach(channel => {
                    if (channel.name.toLowerCase() == "copy-" + message.channel.name.toLowerCase())
                        destChannel = channel;
                });
                if (destChannel == null) {
                    destGuild.channels.add("copy-" + message.channel.name.toLowerCase()).fetch().then(channel => sendMessage(channel, destination, message, redirect));
                }
                else {
                    sendMessage(destChannel, destination, message, redirect);
                }
            }
        });
    });
}
function sendMessage(destChannel, destination, message, redirect) {
    if (destChannel == null) {
        logger['error']("Could not redirect from channel ID " + message.channel.id + " to channel ID "
            + destination + ": Destination channel was not found.");
        return;
    }
    else if (!(destChannel instanceof discord_js_1.TextChannel)) {
        logger['error']("Could not redirect from channel ID " + message.channel.id + " to channel ID "
            + destination + ": Destination channel is not a text channel.");
        return;
    }
    logger['info']("Redirecting message by " + message.author.username
        + " from " + message.guild.name + "/" + message.channel.name
        + " to " + destChannel.guild.name + "/" + destChannel.name);
    message.embeds.forEach(embed => {
        destChannel.send({ embed: embed });
    });
    message.attachments.forEach(attachment => {
        destChannel.send(attachment.url);
    });
    if (!(message.content == '' || message.content == null)) {
        let messageContents = message.content;
        if (redirect.options && redirect.options.copyRichEmbed) {
            message.embeds.forEach(value => {
                if (value.type == "rich") {
                    messageContents = value.description;
                }
            });
        }
        if (redirect.options && redirect.options.removeEveryone)
            messageContents = messageContents.replace("@everyone", "");
        if (redirect.options && redirect.options.removeHere)
            messageContents = messageContents.replace("@here", "");
        if (redirect.options && redirect.options.richEmbed) {
            let richEmbed = new discord_js_1.MessageEmbed({
                color: redirect.options.richEmbedColor ? redirect.options.richEmbedColor : 30975,
                description: messageContents
            });
            if (redirect.options.title) {
                richEmbed.setTitle(redirect.options.title);
            }
            if (redirect.options.includeSource) {
                richEmbed.addField("Author", `**${message.member.displayName}** in **${message.guild.name}/${message.channel.name}**`);
            }
            if (lastEcho != richEmbed.description) {
                destChannel.send({ embed: richEmbed });
                lastEcho = richEmbed.description;
            }
            return;
        }
        else {
            let destinationMessage = "";
            if (redirect.options && redirect.options.title) {
                destinationMessage += "**" + redirect.options.title + "**\n";
            }
            if (redirect.options && redirect.options.includeSource) {
                destinationMessage += `*Author: **${message.member.displayName}** in **${message.guild.name}/${message.channel.name}***\n`;
            }
            destinationMessage += `\n`;
            destinationMessage += messageContents;
            if (lastEcho != destinationMessage) {
                destChannel.send(destinationMessage);
                lastEcho = destinationMessage;
            }
            return;
        }
    }
}
//# sourceMappingURL=MessageForwarder.js.map