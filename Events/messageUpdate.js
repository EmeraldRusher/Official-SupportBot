const { EmbedBuilder } = require('discord.js');
const fs = require("fs");
const yaml = require("js-yaml");
const Event = require("../Structures/Event.js");

// Load the configuration files
const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

module.exports = new Event("messageUpdate", async (client, oldMessage, newMessage) => {

    // Check if the message is from a guild and not from a bot
    if (!newMessage.guild || newMessage.author.bot) return;

    // Fetch old message if it's not cached (important for message content)
    if (!oldMessage.content && oldMessage.partial) {
        try {
            oldMessage = await oldMessage.fetch();
        } catch (err) {
            console.error('Error fetching old message:', err);
            return;
        }
    }

    // Fallback if content is missing
    const oldMessageContent = oldMessage.content || (oldMessage.attachments.size > 0 ? 'Contains attachment(s)' : '*No content*');
    const newMessageContent = newMessage.content || (newMessage.attachments.size > 0 ? 'Contains attachment(s)' : '*No content*');

    // Get the update log channel either by ID or by name
    const updateLogChannel = newMessage.guild.channels.cache.get(supportbot.MessageUpdate.Channel) ||
        newMessage.guild.channels.cache.find(channel => channel.name === supportbot.MessageUpdate.Channel);

    // Create the embed for the updated message
    const updatedMessageEmbed = new EmbedBuilder()
        .setColor(supportbot.MessageUpdate.Colour)
        .setTitle("Message Updated")
        .setDescription(`> **Channel:** <#${newMessage.channel.id}>\n> **Message ID:** [${newMessage.id}](https://discord.com/channels/${newMessage.guild.id}/${newMessage.channel.id}/${newMessage.id})\n> **Message author:** ${newMessage.author.tag} (${newMessage.author.id})\n> **Message Created:** <t:${Math.floor(oldMessage.createdTimestamp / 1000)}:F>`)
        .addFields(
            { name: 'Old Message', value: oldMessageContent, inline: false },
            { name: 'New Message', value: newMessageContent, inline: false }
        )
        .setThumbnail(newMessage.author.displayAvatarURL())
        .setTimestamp();

    // If the new message contains an attachment, add it to the embed
    if (newMessage.attachments.size > 0) {
        const attachment = newMessage.attachments.first();
        updatedMessageEmbed.addFields({ name: 'Attachment', value: `[${attachment.name}](${attachment.proxyURL})` });
    }

    // Send the embed to the update log channel if the channel is found
    if (updateLogChannel) {
        updateLogChannel.send({
            embeds: [updatedMessageEmbed]
        });
    }
});
