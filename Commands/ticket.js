const fs = require("fs");
const {
  EmbedBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonStyle,
  MessageCollector,
} = require("discord.js");
const yaml = require("js-yaml");

const panelconfig = yaml.load(fs.readFileSync("./Configs/ticket-panel.yml", "utf8"));
const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Command = require("../Structures/Command.js");
const TicketNumberID = require("../Structures/TicketID.js");

async function isBlacklisted(userId) {
  let blacklistData;
  try {
    blacklistData = JSON.parse(fs.readFileSync("./Data/BlacklistedUsers.json", "utf8"));
  } catch (error) {
    console.error("Error reading BlacklistedUsers.json:", error);
    return false; 
  }
  
  if (!blacklistData || !Array.isArray(blacklistData.blacklistedUsers)) {
    console.error("blacklistedUsers is not defined or is not an array");
    return false;
  }
  
  return blacklistData.blacklistedUsers.includes(userId);
}

async function getClockedInUsers(guild) {
  const clockedInUsers = new Set();

  const profilesDir = './Data/Profiles';
  const profileFiles = fs.readdirSync(profilesDir);

  for (const file of profileFiles) {
    const profileData = JSON.parse(fs.readFileSync(`${profilesDir}/${file}`, "utf8"));
    if (profileData.clockedIn) {
      const userId = file.replace('.json', '');
      const member = await guild.members.fetch(userId);
      if (member) clockedInUsers.add(member.id);
    }
  }
  return clockedInUsers;
}

async function askTicketQuestions(ticketChannel, interaction, questions) {
  const answers = [];
  let questionIndex = 0;

  const sendNextQuestion = async () => {
    if (questionIndex < questions.length) {

      const questionsEmbed = new EmbedBuilder()
        .setDescription(`**${questionIndex + 1}.** ${questions[questionIndex]}`)
        .setColor(supportbot.Embed.Colours.General)

      const questionMessage = await ticketChannel.send({
        embeds: [questionsEmbed], 
      });

      const collector = new MessageCollector(ticketChannel, {
        filter: (m) => m.author.id === interaction.user.id,
        max: 1,
        time: 60000,
      });

      collector.on("collect", async (message) => {
        answers.push({ question: questions[questionIndex], answer: message.content });
        questionIndex++;
        await message.delete();
        await questionMessage.delete();
        sendNextQuestion();
      });

    } else {

      const summaryEmbed = new EmbedBuilder()
        .setTitle(msgconfig.Ticket.TicketQuestions.Details.Title)
        .setDescription(msgconfig.Ticket.TicketQuestions.Details.Description.replace('%user%', interaction.user.id))
        .setColor(supportbot.Embed.Colours.General)
        .addFields(
          answers.map((a) => ({
            name: `Q: ${a.question}`,
            value: `A: ${a.answer}`,
            inline: false,
          }))
        )
        .setTimestamp();

      await ticketChannel.send({ 
        embeds: [summaryEmbed] 
      });
    }
  };

  // Start asking the first question
  sendNextQuestion();
}

async function assignTicketToUser(ticketChannel, Staff, Admin, interaction, attempts = 0) {

  try {
    const clockedInUsers = await getClockedInUsers(interaction.guild);

    if (clockedInUsers.size === 0 || attempts >= 2) {
      const claimChannel = await interaction.guild.channels.cache.get(supportbot.Ticket.ClaimTickets.Channel);
      if (claimChannel) {
        const claimEmbed = new EmbedBuilder()
          .setTitle(msgconfig.Ticket.ClaimTickets.ClaimTitle)
          .setDescription(msgconfig.Ticket.ClaimTickets.ClaimMessage)
          .setColor(supportbot.Embed.Colours.General);

        const claimButton = new ButtonBuilder()
          .setCustomId(`claimticket-${ticketChannel.id}`)
          .setLabel(supportbot.Ticket.ClaimTickets.ButtonTitle || 'Claim Ticket')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(claimButton);

        const claimMessage = await claimChannel.send({
          content: `<@&${Staff.id}> <@&${Admin.id}>`,
          embeds: [claimEmbed],
          components: [row],
        });

        const filter = i => i.customId === `claimticket-${ticketChannel.id}` && i.member.roles.cache.has(Staff.id);
        const collector = claimMessage.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async i => {
          await ticketChannel.send({ content: `<@${i.user.id}> has claimed the ticket.` });
        });

        collector.on('end', async collected => {
          if (collected.size === 0) {
            await claimMessage.delete();

            await claimChannel.send({
              content: `Ticket is still unclaimed. \nCC: [<@&${Staff.id}> <@&${Admin.id}]`,
              embeds: [new EmbedBuilder().setDescription(`Ticket is still unclaimed: <#${ticketChannel.id}>`).setColor(supportbot.Embed.Colours.Warn)],
            });
          }
        });

        return null;
      } else {
        console.error("Claim channel not found");
        return null;
      }
    }

    const clockedInArray = Array.from(clockedInUsers);
    const assignedUserId = clockedInArray[Math.floor(Math.random() * clockedInArray.length)];
    const assignedUser = await interaction.guild.members.fetch(assignedUserId);

    const claimEmbed = new EmbedBuilder()
      .setTitle(msgconfig.Ticket.ClaimTickets.ClaimTitle)
      .setDescription(msgconfig.Ticket.ClaimTickets.ClaimMessage.replace('%user%', interaction.user.id))
      .setColor(supportbot.Embed.Colours.General);

    const claimButton = new ButtonBuilder()
      .setCustomId(`claimticket-${ticketChannel.id}`)
      .setLabel(supportbot.Ticket.ClaimTickets.ButtonTitle || 'Claim Ticket')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(claimButton);

    const claimChannel = await interaction.guild.channels.cache.get(supportbot.Ticket.ClaimTickets.Channel);
    if (!claimChannel) {
      console.error("Claim channel not found");
      return null;
    }

    const claimMessage = await claimChannel.send({
      content: `${assignedUser}`,
      embeds: [claimEmbed],
      components: [row],
    });

    const filter = i => i.customId === `claimticket-${ticketChannel.id}` && i.user.id === assignedUserId;
    const collector = claimMessage.createMessageComponentCollector({ filter, time: 120000 });

    collector.on('collect', async i => {
      await ticketChannel.send({ content: `<@${assignedUserId}>` }).then(msg => setTimeout(() => msg.delete(), 5000));
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        await claimMessage.delete();

        if (attempts >= 1) {
          await claimChannel.send({
            content: `No one claimed the ticket. Tagging roles: <@&${Staff.id}> <@&${Admin.id}>`,
            embeds: [new EmbedBuilder().setDescription(`Ticket is still unclaimed: <#${ticketChannel.id}>`).setColor(supportbot.Embed.Colours.Warn)],
          });

          const claimEmbed = new EmbedBuilder()
            .setTitle(msgconfig.Ticket.ClaimTickets.ClaimTitle)
            .setDescription(msgconfig.Ticket.ClaimTickets.ClaimMessage)
            .setColor(supportbot.Embed.Colours.General);

          const claimButton = new ButtonBuilder()
            .setCustomId(`claimticket-${ticketChannel.id}`)
            .setLabel(supportbot.Ticket.ClaimTickets.ButtonTitle)
            .setEmoji(supportbot.Ticket.ClaimTickets.ButtonEmoji)
            .setStyle(ButtonStyle.Primary);

          const row = new ActionRowBuilder().addComponents(claimButton);

          const claimMessage = await claimChannel.send({
            embeds: [claimEmbed],
            components: [row],
          });

          const filter = i => i.customId === `claimticket-${ticketChannel.id}` && i.member.roles.cache.has(Staff.id);
          const collector = claimMessage.createMessageComponentCollector({ filter, time: 120000 });

          collector.on('collect', async i => {
            console.log(`Ticket ${ticketChannel.id} claimed by user ${i.user.id}`);
            await ticketChannel.member.add(i.user.id);
          });

          collector.on('end', async collected => {
            if (collected.size === 0) {
              console.log(`No one claimed the ticket (${ticketChannel.id}), notifying all staff`);
              await claimMessage.delete();

              await claimChannel.send({
                content: `No one claimed the ticket. Tagging roles: <@&${Staff.id}> <@&${Admin.id}>`,
              });
            }
          });
        } else {
          const ReassigningEmbed = new EmbedBuilder()
            .setTitle(msgconfig.Ticket.ClaimTickets.ReassigningTitle)
            .setDescription(msgconfig.Ticket.ClaimTickets.ReassigningMessage.replace('%user%', assignedUserId))
            .setColor(supportbot.Embed.Colours.General);

          await claimChannel.send({ embeds: [ReassigningEmbed], components: [] });
          await assignTicketToUser(ticketChannel, Staff, Admin, interaction, attempts + 1);
        }
      }
    });

    return assignedUserId;
  } catch (error) {
    console.error("Error in assignTicketToUser function:", error);
    if (error instanceof CombinedError) {
      console.error("CombinedError details:", error.errors);
    }
    return null;
  }
}

module.exports = new Command({
  name: cmdconfig.OpenTicket.Command,
  description: cmdconfig.OpenTicket.Description,
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: "reason",
      description: "Ticket Reason",
      type: ApplicationCommandOptionType.String,
    },
  ],
  permissions: cmdconfig.OpenTicket.Permission,

  async run(interaction) {
    
    try {

      if (await isBlacklisted(interaction.user.id)) {
        return interaction.reply({
          content: msgconfig.Ticket.Blacklisted,
          ephemeral: true,
        });
      }

      let TicketReason = null;
      if (supportbot.Ticket.TicketReason) {
        TicketReason = interaction.reason || null; // Retrieve the reason from the interaction object
      }

      let TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
      const { getRole, getChannel } = interaction.client;
      let User = interaction.guild.members.cache.get(interaction.user.id);

      if (
        supportbot.Ticket.TicketsPerUser &&
        TicketData.tickets.filter((t) => t.user === interaction.user.id && t.open).length >= supportbot.Ticket.TicketsPerUser
      ) {
        return interaction.reply({
          embeds: [
            {
              title: "Too Many Tickets!",
              description: `You can't have more than ${supportbot.Ticket.TicketsPerUser} open tickets!`,
              color: supportbot.Embed.Colours.Warn,
            },
          ],
          ephemeral: true,
        });
      }

      let ticketNumberID = await TicketNumberID.pad();
      const TicketSubject = TicketReason || msgconfig.Ticket.InvalidSubject;

      const TicketExists = new EmbedBuilder()
        .setTitle("Ticket Exists!")
        .setDescription(msgconfig.Ticket.TicketExists);

      if (
        await interaction.guild.channels.cache.find(
          (ticketChannel) => ticketChannel.name === `${supportbot.Ticket.Channel}${ticketNumberID}`
        )
      ) {
        return await interaction.reply({
          embeds: [TicketExists],
          ephemeral: true,
        });
      }

      const Staff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);
      if (!Staff || !Admin)
        return interaction.reply({
          content: "Some roles seem to be missing!\nPlease check for errors when starting the bot.",
          ephemeral: true,
        });

      let ticketChannel;

      if (supportbot.Ticket.TicketType === "threads") {
        const TicketHome = interaction.guild.channels.cache.find(
          (c) => c.name === supportbot.Ticket.TicketHome || c.id === supportbot.Ticket.TicketHome
        );

        const channel = await getChannel(supportbot.Ticket.TicketHome, interaction.guild);
        ticketChannel = await channel.threads.create({
          name: `${supportbot.Ticket.Channel}${ticketNumberID}`,
          type: ChannelType.PrivateThread,
          parent: TicketHome,
          autoArchiveDuration: 60,
          reason: 'support ticket',
        });
      } else if (supportbot.Ticket.TicketType === "channels") {
        const category = interaction.guild.channels.cache.find(
          (c) => c.name === supportbot.Ticket.TicketChannelsCategory || c.id === supportbot.Ticket.TicketChannelsCategory
        );

        if (!category) {
          return interaction.reply({
            content: "The ticket category does not exist!",
            ephemeral: true,
          });
        }

        ticketChannel = await interaction.guild.channels.create({
          name: `${supportbot.Ticket.Channel}${ticketNumberID}`,
          type: ChannelType.GuildText,
          parent: category.id,
          reason: 'support ticket',
        });

        // Move to secondary category if the primary one is full
        if (category.children.size >= 50) {
          const secondaryCategory = interaction.guild.channels.cache.find(
            (c) => c.name === supportbot.Ticket.TicketChannelsCategory2 || c.id === supportbot.Ticket.TicketChannelsCategory2
          );

          if (secondaryCategory) {
            await ticketChannel.setParent(secondaryCategory.id);
          } else {
            return interaction.reply({
              content: "The secondary ticket category does not exist!",
              ephemeral: true,
            });
          }
        }
      }

      // Assign ticket to a user if claiming tickets is enabled
      if (supportbot.Ticket.ClaimTickets.Enabled) {
        const assignedUserId = await assignTicketToUser(ticketChannel, Staff, Admin, interaction);
        if (!assignedUserId) {
          const claimChannel = await interaction.guild.channels.cache.get(supportbot.Ticket.ClaimTickets.Channel);
        }
      }

      if (supportbot.Ticket.TicketType === "threads") {
        await ticketChannel.members.add(interaction.user.id); 

    } else if (supportbot.Ticket.TicketType === "channels") {

        await ticketChannel.permissionOverwrites.create(interaction.user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        }); 

        await ticketChannel.permissionOverwrites.create(Admin, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
      }); 

        await ticketChannel.permissionOverwrites.create(interaction.guild.roles.everyone, {
          ViewChannel: false,
        }); 
    }
    
      // Ask questions to the user after the ticket is opened
      if (supportbot.Ticket.Questions.Enabled) {
        const questions = supportbot.Ticket.Questions.List || [];
        if (questions.length > 0) {
          await askTicketQuestions(ticketChannel, interaction, questions);
        }
      }

      // Save ticket data
      TicketData.tickets.push({
        id: ticketChannel.id,
        name: ticketChannel.name,
        user: interaction.user.id,
        number: ticketNumberID,
        reason: TicketSubject,
        open: true,
        subUsers: [],
        createdAt: new Date().toISOString(),
        claimedAt: null,
      });

      fs.writeFileSync(
        "./Data/TicketData.json",
        JSON.stringify(TicketData, null, 4),
        (err) => {
          if (err) console.error(err);
        }
      );

      // Notify the user that the ticket was created
      const CreatedTicket = new EmbedBuilder()
        .setDescription(
          msgconfig.Ticket.TicketCreatedAlert.replace(/%ticketauthor%/g, interaction.user.id)
            .replace(/%ticketid%/g, ticketChannel.id)
            .replace(/%ticketusername%/g, interaction.user.username)
            .replace(/%ticketreason%/g, TicketSubject)
        )
        .setColor(supportbot.Embed.Colours.General);
      await interaction.reply({ embeds: [CreatedTicket], ephemeral: true });

      // Create the ticket message
      const TicketMessage = new EmbedBuilder()
        .setAuthor({
          name: msgconfig.Ticket.TicketAuthorTitle.replace(/%ticketauthor%/g, interaction.user.id)
            .replace(/%ticketid%/g, ticketChannel.id)
            .replace(/%ticketusername%/g, interaction.user.username),
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setTitle(
          msgconfig.Ticket.TicketTitle.replace(/%ticketauthor%/g, interaction.user.id)
            .replace(/%ticketid%/g, ticketChannel.id)
            .replace(/%ticketusername%/g, interaction.user.username)
        )
        .setDescription(
          msgconfig.Ticket.TicketMessage.replace(/%ticketauthor%/g, interaction.user.id)
            .replace(/%ticketid%/g, ticketChannel.id)
            .replace(/%ticketusername%/g, interaction.user.username)
            .replace(/%ticketreason%/g, TicketSubject)
        )
        .setColor(supportbot.Embed.Colours.General);

      if (supportbot.Ticket.TicketReason && TicketReason) {
        TicketMessage.addFields(
          { name: "Reason", value: TicketReason, inline: false }
        );
      }

      // Create the control panel
      const SelectMenus = new StringSelectMenuBuilder()
      .setCustomId("ticketcontrolpanel")
      .setPlaceholder("Ticket Control Panel")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Close")
          .setDescription("Close the ticket.")
          .setEmoji(supportbot.SelectMenus.Tickets.CloseEmoji)
          .setValue("ticketclose"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Voice Channel")
          .setDescription("Create a support voice channel.")
          .setEmoji(supportbot.SelectMenus.Tickets.VCEmoji)
          .setValue("supportvc"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Archive")
          .setDescription("Archive the ticket.")
          .setEmoji(supportbot.SelectMenus.Tickets.ArchiveEmoji)
          .setValue("archiveticket"),
        ...(supportbot.Ticket.TicketType === "threads" ? [
          new StringSelectMenuOptionBuilder()
            .setLabel("Lock Ticket")
            .setDescription("Lock the ticket.")
            .setEmoji(supportbot.SelectMenus.Tickets.LockEmoji)
            .setValue("lockticket")
        ] : []), 
        new StringSelectMenuOptionBuilder()
          .setLabel("Rename Ticket")
          .setDescription("Rename the ticket.")
          .setEmoji(supportbot.SelectMenus.Tickets.RenameEmoji)
          .setValue("renameticket")
      );

        if (supportbot.Ticket.TicketType === "threads") {
          SelectMenus.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Enable Invites")
              .setDescription("Enable invites.")
              .setEmoji(supportbot.SelectMenus.Tickets.EnableInvitesEmoji)
              .setValue("enableinvites"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Disable Invites")
              .setDescription("Disable invites.")
              .setEmoji(supportbot.SelectMenus.Tickets.DisableInvitesEmoji)
              .setValue("disableinvites"),
          );
        }

      const row2 = new ActionRowBuilder().addComponents(SelectMenus);

      await ticketChannel.send({
        embeds: [TicketMessage],
        components: [row2],
      });

      
    } catch (error) {
      console.error("Error in run method:", error);
    }
  },
});
