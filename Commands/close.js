const fs = require("fs");
const Discord = require("discord.js");
const yaml = require("js-yaml");

const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Command = require("../Structures/Command.js");

module.exports = new Command({
  name: cmdconfig.CloseTicket.Command,
  description: cmdconfig.CloseTicket.Description,
  type: Discord.ApplicationCommandType.ChatInput,
  options: [
    {
      name: "reason",
      description: "Ticket Close Reason",
      type: Discord.ApplicationCommandOptionType.String,
    }
  ],
  permissions: cmdconfig.CloseTicket.Permission,

  async run(interaction) {
    const { getRole, getChannel } = interaction.client;

    if (supportbot.Ticket.Close.StaffOnly) {
      let SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      let Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      if (!SupportStaff || !Admin) {
        return interaction.reply("Some roles seem to be missing! Please check for errors when starting the bot.");
      }

      const NoPerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(`${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``)
        .setColor(supportbot.Embed.Colours.Warn);

      if (!interaction.member.roles.cache.has(SupportStaff.id) && !interaction.member.roles.cache.has(Admin.id)) {
        return interaction.reply({ embeds: [NoPerms] });
      }
    }

    const isThread = interaction.channel.type === Discord.ChannelType.PrivateThread;
    if (
      (supportbot.Ticket.TicketType === "threads" && !isThread) ||
      (supportbot.Ticket.TicketType === "channels" && interaction.channel.type !== Discord.ChannelType.GuildText)
    ) {
      const NotTicketChannel = new Discord.EmbedBuilder()
        .setTitle("Invalid Channel!")
        .setDescription(`This command can only be used in a ${supportbot.Ticket.TicketType === "threads" ? "ticket thread" : "ticket channel"}.`)
        .setColor(supportbot.Embed.Colours.Warn);

      return interaction.reply({ embeds: [NotTicketChannel], ephemeral: true });
    }

    await interaction.deferReply();

    let tickets;
    try {
      tickets = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
    } catch (err) {
      console.error("Error reading ticket data file:", err);
      return interaction.followUp({ content: "There was an error loading ticket data." });
    }

    let TicketData = tickets.tickets.findIndex((t) => t.id === interaction.channel.id);
    let ticket = tickets.tickets[TicketData];

    if (TicketData === -1) {
      const Exists = new Discord.EmbedBuilder()
        .setTitle("No Ticket Found!")
        .setDescription(msgconfig.Error.NoValidTicket)
        .setColor(supportbot.Embed.Colours.Warn);
      return interaction.followUp({ embeds: [Exists] });
    }

    let reason = interaction.options?.getString("reason") || "No Reason Provided.";
    const ticketUserId = ticket.user;

    if (supportbot.Ticket.ReviewSystem.Enabled) {
      const rating = await collectReviewRating(interaction, ticketUserId);
      const comment = await collectReviewComment(interaction, ticketUserId);

      const reviewChannel = await getChannel(supportbot.Ticket.ReviewSystem.Channel, interaction.guild);
      const reviewer = supportbot.Ticket.ClaimTickets ? `<@${ticket.claimedBy}>` : null;

      const reviewEmbed = new Discord.EmbedBuilder()
        .setTitle(msgconfig.ReviewSystem.ReviewEmbed.Title)
        .addFields(
          {
            name: msgconfig.ReviewSystem.ReviewEmbed.RatingTitle,
            value: `${msgconfig.ReviewSystem.ReviewEmbed.ReviewEmoji.repeat(rating)}`,
            inline: false
          },
          {
            name: msgconfig.ReviewSystem.ReviewEmbed.CommentTitle,
            value: `\`\`\`${comment}\`\`\``,
            inline: false
          }
        )
        .setColor(msgconfig.ReviewSystem.ReviewEmbed.Color);

      if (supportbot.Ticket.ClaimTickets.Enabled) {
        reviewEmbed.setDescription(
          `**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedStaffTitle}** ${reviewer}\n**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedByTitle}** <@${ticketUserId}>` || `N/A`
        );
      } else {
        reviewEmbed.setDescription(
          `**${msgconfig.ReviewSystem.ReviewEmbed.ReviewedByTitle}** <@${ticketUserId}>`
        );
      }

      if (reviewChannel) {
        await reviewChannel.send({ embeds: [reviewEmbed] });
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({ embeds: [reviewEmbed] });
      }

      await handleCloseTicket(interaction, reason, ticket, TicketData);
    } else {
      await handleCloseTicket(interaction, reason, ticket, TicketData);
    }
  },
});

async function collectReviewRating(interaction, ticketUserId) {
  const reviewPrompt = new Discord.EmbedBuilder()
    .setTitle(msgconfig.ReviewSystem.Rate.Title)
    .setDescription(`${msgconfig.ReviewSystem.Rate.Description}`)
    .setColor(supportbot.Embed.Colours.General);

  const stars = new Discord.ActionRowBuilder().addComponents(
    new Discord.StringSelectMenuBuilder()
      .setCustomId("starRating")
      .setPlaceholder("Select a rating")
      .addOptions([
        { label: msgconfig.ReviewSystem.Stars.One, value: "1" },
        { label: msgconfig.ReviewSystem.Stars.Two, value: "2" },
        { label: msgconfig.ReviewSystem.Stars.Three, value: "3" },
        { label: msgconfig.ReviewSystem.Stars.Four, value: "4" },
        { label: msgconfig.ReviewSystem.Stars.Five, value: "5" },
      ])
  );

  await interaction.followUp({
    content: `<@${ticketUserId}>`,
    embeds: [reviewPrompt],
    components: [stars],
    ephemeral: true,
  });

  const starRating = await interaction.channel.awaitMessageComponent({
    componentType: Discord.ComponentType.StringSelect,
    filter: (i) => i.customId === "starRating" && i.user.id === ticketUserId,
  });
  await starRating.deferUpdate();
  return starRating.values[0];
}

async function collectReviewComment(interaction, ticketUserId) {
  const commentPrompt = new Discord.EmbedBuilder()
    .setTitle(msgconfig.ReviewSystem.Comment.Title)
    .setDescription(`${msgconfig.ReviewSystem.Comment.Description}`)
    .setColor(supportbot.Embed.Colours.General);

  await interaction.followUp({
    content: `<@${ticketUserId}>`,
    embeds: [commentPrompt],
    ephemeral: true,
  });

  const filter = (response) => response.author.id === ticketUserId;

  const commentCollection = await interaction.channel.awaitMessages({ filter, max: 1 });
  const comment = commentCollection.first()?.content;
  return comment && comment.toLowerCase() !== "no" ? comment : "No Comment Provided";
}
async function handleCloseTicket(interaction, reason, ticket, TicketData) {
  const { getChannel } = interaction.client;

  let tickets;
  try {
    tickets = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
  } catch (err) {
    console.error("Error reading ticket data:", err);
    return interaction.followUp("Failed to load ticket data.");
  }

  let tUser = interaction.client.users.cache.get(ticket.user);
  let transcriptChannel = await getChannel(supportbot.Ticket.Log.TicketDataLog, interaction.guild);

  if (!transcriptChannel) {
    console.log("Transcript channel missing or inaccessible");
    return interaction.followUp("Error: Transcript log channel is missing or bot lacks permission.");
  }

  try {
    // Fetch all messages from the channel
    let allMessages = [];
    let lastId = null;
    
    while (true) {
      const options = { limit: 100 };
      if (lastId) {
        options.before = lastId;
      }
      
      const messages = await interaction.channel.messages.fetch(options);
      if (messages.size === 0) break;
      
      allMessages = [...allMessages, ...messages.values()];
      lastId = messages.last().id;
      
      if (messages.size < 100) break;
    }

    // Sort messages by timestamp
    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Create transcript data
    const transcriptData = allMessages.map(msg => ({
      content: msg.content || "No content",
      username: msg.author.username,
      userId: msg.author.id,
      avatar: msg.author.displayAvatarURL(),
      timestamp: msg.createdAt.toISOString(),
      attachments: Array.from(msg.attachments.values()).map(att => ({
        url: att.url,
        name: att.name
      })),
      embeds: msg.embeds.map(embed => ({
        title: embed.title,
        description: embed.description,
        fields: embed.fields
      }))
    }));

    // Update ticket status
    tickets.tickets[TicketData].open = false;
    tickets.tickets[TicketData].messages = transcriptData;
    fs.writeFileSync("./Data/TicketData.json", JSON.stringify(tickets, null, 4));

    const transcriptEmbed = new Discord.EmbedBuilder()
      .setTitle(msgconfig.TicketLog.Title)
      .setColor(msgconfig.TicketLog.Colour)
      .setFooter({ text: supportbot.Embed.Footer, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(
        `> **Ticket:** ${interaction.channel.name} (\`${interaction.channel.id}\`)\n` +
        `> **User:** ${tUser?.tag || "Unknown User"} (\`${tUser?.id || ticket.user}\`)\n` +
        `> **Closed by:** <@${interaction.user.id}>\n` +
        `> **Message Count:** ${transcriptData.length}`
      )
      .addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: true });

    const html = createTranscriptHTML(
      {
        id: interaction.channel.id,
        messages: transcriptData,
        name: interaction.channel.name
      },
      reason
    );

    const fileName = `${interaction.channel.id}-transcript.html`;
    fs.writeFileSync(`./Data/Transcripts/${fileName}`, html);

    await transcriptChannel.send({
      embeds: [transcriptEmbed],
      files: [{
        attachment: `./Data/Transcripts/${fileName}`,
        name: fileName,
        spoiler: true
      }]
    });

    if (interaction.channel.type === Discord.ChannelType.GuildText ||
        interaction.channel.type === Discord.ChannelType.PrivateThread) {
      await interaction.channel.delete();
    }
  } catch (err) {
    console.error("Error handling ticket close:", err);
    interaction.followUp("An error occurred while closing the ticket.");
  }
}

function createTranscriptHTML(ticket, reason) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
        <style>
          body {
            background-color: #1a1a1a;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: white;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background-color: rgba(0, 0, 0, 0.3);
            border-radius: 15px;
            padding: 20px;
          }
          .message {
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 15px;
          }
          .message-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
          }
          .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            margin-right: 15px;
          }
          .username {
            font-weight: bold;
            color: #4CAF50;
          }
          .timestamp {
            margin-left: auto;
            color: #888;
            font-size: 0.9em;
          }
          .content {
            word-break: break-word;
          }
          .embed {
            border-left: 4px solid #4CAF50;
            padding-left: 10px;
            margin: 10px 0;
            background-color: rgba(0, 0, 0, 0.2);
          }
          .attachment {
            display: inline-block;
            background-color: rgba(76, 175, 80, 0.1);
            border: 1px solid #4CAF50;
            border-radius: 5px;
            padding: 5px 10px;
            margin: 5px 0;
            color: #4CAF50;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="mb-6">
            <h1 class="text-3xl font-bold mb-4">Ticket Transcript</h1>
            <p><strong>Channel:</strong> ${ticket.name}</p>
            <p><strong>Ticket ID:</strong> ${ticket.id}</p>
            <p><strong>Message Count:</strong> ${ticket.messages.length}</p>
            <p><strong>Close Reason:</strong> ${reason}</p>
          </div>
          
          <div class="messages">
            ${ticket.messages.map(msg => `
              <div class="message">
                <div class="message-header">
                  <img src="${msg.avatar}" alt="Avatar" class="avatar">
                  <span class="username">${msg.username}</span>
                  <span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span>
                </div>
                <div class="content">
                  ${msg.content}
                  
                  ${msg.embeds.map(embed => `
                    <div class="embed">
                      ${embed.title ? `<div class="font-bold">${embed.title}</div>` : ''}
                      ${embed.description ? `<div>${embed.description}</div>` : ''}
                      ${embed.fields.map(field => `
                        <div class="mt-2">
                          <strong>${field.name}:</strong>
                          <div>${field.value}</div>
                        </div>
                      `).join('')}
                    </div>
                  `).join('')}
                  
                  ${msg.attachments.map(att => `
                    <a href="${att.url}" class="attachment" target="_blank">
                      📎 ${att.name}
                    </a>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
    </html>
  `;
}
