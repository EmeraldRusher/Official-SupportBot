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
    tickets.tickets[TicketData].open = false;
    fs.writeFileSync("./Data/TicketData.json", JSON.stringify(tickets, null, 4));

    const transcriptEmbed = new Discord.EmbedBuilder()
      .setTitle(msgconfig.TicketLog.Title)
      .setColor(msgconfig.TicketLog.Colour)
      .setFooter({ text: supportbot.Embed.Footer, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(
        `> **Ticket:** ${interaction.channel.name} (\`${interaction.channel.id}\`)\n` +
        `> **User:** ${tUser?.tag || "Unknown User"} (\`${tUser?.id || ticket.user}\`)\n` +
        `> **Closed by:** <@${interaction.user.id}>`
      )
      .addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: true });

    let msgs = await interaction.channel.messages.fetch({ limit: 100 });
    let html = createTranscriptHTML(ticket, msgs);

    const fileName = `${interaction.channel.id}-transcript.html`;
    fs.writeFileSync(`./Data/Transcripts/${fileName}`, html);

    await transcriptChannel.send({
      embeds: [transcriptEmbed],
      files: [`./Data/Transcripts/${fileName}`],
      spoiler: true, 
    });

    if (interaction.channel.type === Discord.ChannelType.GuildText) {
      await interaction.channel.delete();
    } else if (interaction.channel.type === Discord.ChannelType.PrivateThread) {
      await interaction.channel.delete();
    }
  } catch (err) {
    console.error("Error handling ticket close:", err);
    interaction.followUp("An error occurred while closing the ticket.");
  }
}

function createTranscriptHTML(ticket, reason) {
  const messages = ticket.messages || [];
  return `
    <html>
      <head>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
        <style>
          body {
            background-color: #1a1a1a;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: white;
            margin: 0;
            padding: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .container {
            backdrop-filter: blur(10px);
            background-color: rgba(0, 128, 0, 0.3);
            border-radius: 15px;
            padding: 20px;
            margin: 20px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            max-width: 1000px;
            width: 100%;
            margin: auto;
          }
          .message {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            padding: 10px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
          }
          .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            margin-right: 10px;
          }
          .content {
            flex: 1;
          }
          .username {
            font-weight: bold;
          }
          .timestamp {
            font-size: 0.8em;
            color: #bbb;
          }
          .download-button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 16px;
            margin-top: 20px;
            border-radius: 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="text-2xl font-bold mb-4">Ticket Transcript</h1>
          <p><strong>Server Name:</strong> Emerald Services</p>
          <p><strong>Ticket:</strong> ${ticket.id}</p>
          <p><strong>Messages:</strong> ${messages.length} Messages</p>
          <div class="mt-4">
            ${messages.map(msg => `
              <div class="message">
                <img src="${msg.avatar}" alt="User Avatar" class="avatar" />
                <div class="content">
                  <p class="username">${msg.username}</p>
                  <p>${msg.content}</p>
                  <p class="timestamp">${msg.timestamp}</p>
                </div>
              </div>`).join('')}
          </div>
          <a href="ticket-${ticket.id}.html" download class="download-button">Download Transcript</a>
        </div>
      </body>
    </html>
  `;
}


