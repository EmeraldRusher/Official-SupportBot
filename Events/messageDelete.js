const { EmbedBuilder } = require('discord.js');
const fs = require("fs");
const yaml = require("js-yaml");
const Event = require("../Structures/Event.js");

// Load the configuration files
const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

module.exports = new Event("messageDelete", async (client, message) => {

    // Check if the message is from a guild and not from a bot
    if (!message.guild || message.author.bot) return;

    // Get the delete log channel either by ID or by name
    const deleteLogChannel = message.guild.channels.cache.get(supportbot.MessageDelete.Channel) ||
        message.guild.channels.cache.find(channel => channel.name === supportbot.MessageDelete.Channel);

    // Create the embed for the deleted message
    const deletedMessageEmbed = new EmbedBuilder()
        .setColor(supportbot.MessageDelete.Colour)
        .setTitle("Message Deleted")
        .setDescription(`> **Channel:** <#${message.channel.id}>\n> **Message ID** [${message.id}](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id})\n> **Message author:** ${message.author.tag} (${message.author.id})\n> **Message Crated:** <t:${Math.floor(message.createdTimestamp / 1000)}:F>`)
        .addFields(
            { name: 'Message', value: message.content || '*No content*', inline: false }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

    // If the message contains an attachment, add it to the embed
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        deletedMessageEmbed.addFields({ name: 'Attachment', value: `[${attachment.name}](${attachment.proxyURL})` });
    }

    // Send the embed to the delete log channel if the channel is found
    if (deleteLogChannel) {
        deleteLogChannel.send({
            embeds: [deletedMessageEmbed]
        });
    }
});

