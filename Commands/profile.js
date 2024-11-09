const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ApplicationCommandType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandOptionType } = require("discord.js");
const fs = require("fs");
const yaml = require("js-yaml");

const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Command = require("../Structures/Command.js");

const clockedInUsers = new Set();

function updateClockedInStatus(profileEmbed, clockedIn) {
  profileEmbed.data.fields = profileEmbed.data.fields.map(field => {
    if (field.name === 'Clocked In Status') {
      field.value = clockedIn ? '✅ Clocked In' : '❌ Clocked Out';
    }
    return field;
  });
  return profileEmbed;
}

module.exports = new Command({
  name: cmdconfig.Profile.Command,
  description: cmdconfig.Profile.Description,
  type: ApplicationCommandType.ChatInput,
  permissions: cmdconfig.Profile.Permission,
  options: [
    {
      name: 'user',
      description: 'The user to view the profile of',
      type: ApplicationCommandOptionType.User,
      required: false
    }
  ],

  async run(interaction) {
    await interaction.deferReply({ ephemeral: true }); 

    const userOption = interaction.options.getUser('user');
    const viewingUser = userOption || interaction.user;
    const viewingUserId = viewingUser.id;
    const interactionUserId = interaction.user.id;

    const user = interaction.guild.members.cache.get(viewingUserId);
    const { getRole, getChannel } = interaction.client;

    const Staff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
    const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

    if (!Staff || !Admin) {
      return interaction.editReply({
        content: "Some roles seem to be missing!\nPlease check for errors when starting the bot.",
        ephemeral: true,
      });
    }

    const isStaff = user.roles.cache.has(Staff.id) || user.roles.cache.has(Admin.id);
    const isOwnProfile = interactionUserId === viewingUserId;

    const profilePath = `./Data/Profiles/${viewingUserId}.json`;
    let profileData;

    if (fs.existsSync(profilePath)) {
      profileData = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    } else {
      profileData = {
        bio: "",
        timezone: "",
        clockedIn: false
      };
      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
    }

    const { bio, timezone, clockedIn } = profileData;

    let profileEmbed = new EmbedBuilder()
      .setTitle(`${viewingUser.username}'s Profile`)
      .setColor(supportbot.Embed.Colours.General)
      .setThumbnail(viewingUser.displayAvatarURL())
      .addFields(
        { name: 'Bio', value: bio || 'No bio set.', inline: false },
        { name: 'Timezone', value: timezone || 'No timezone set.', inline: true }
      );

    if (isStaff) {
      profileEmbed.addFields({ name: 'Clocked In Status', value: clockedIn ? '✅ Clocked In' : '❌ Clocked Out', inline: true });
    }

    const buttonRow = new ActionRowBuilder();
    if (isOwnProfile) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId('editProfile')
          .setLabel('Edit Profile')
          .setStyle(ButtonStyle.Secondary)
      );

      if (isStaff) {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId('clockInOut')
            .setLabel(clockedIn ? 'Clock Out' : 'Clock In')
            .setStyle(ButtonStyle.Secondary)
        );
      }
    }

    if (isStaff && supportbot.Ticket.ClaimTickets.Enabled) {
      buttonRow.addComponents(
        new ButtonBuilder()
          .setCustomId('viewTicketStats')
          .setLabel('View Ticket Stats')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    await interaction.editReply({ embeds: [profileEmbed], components: buttonRow.components.length > 0 ? [buttonRow] : [] });

    const filter = i => (
      ['editProfile', 'clockInOut', 'viewTicketStats', 'showOpenTickets', 'backToStats', 'backToProfile'].includes(i.customId) 
      && i.user.id === interactionUserId
    );

    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      if (i.customId === 'editProfile') {
        const modal = new ModalBuilder()
          .setCustomId('editProfileModal')
          .setTitle('Edit Profile')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('bio')
                .setLabel('Bio')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter your bio')
                .setValue(String(bio))
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('timezone')
                .setLabel('Timezone')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter your timezone')
                .setValue(String(timezone))
                .setRequired(false)
            )
          );

        await i.showModal(modal);
      }

      if (i.customId === 'clockInOut') {
        profileData.clockedIn = !profileData.clockedIn;
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
        profileEmbed = updateClockedInStatus(profileEmbed, profileData.clockedIn);

        if (profileData.clockedIn) {
          clockedInUsers.add(viewingUserId);
        } else {
          clockedInUsers.delete(viewingUserId);
        }

        const updatedButtonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('editProfile')
              .setLabel('Edit Profile')
              .setStyle(ButtonStyle.Secondary)
          );

        if (isStaff) {
          updatedButtonRow.addComponents(
            new ButtonBuilder()
              .setCustomId('clockInOut')
              .setLabel(profileData.clockedIn ? 'Clock Out' : 'Clock In')
              .setStyle(ButtonStyle.Secondary)
          );

          if (supportbot.Ticket.ClaimTickets.Enabled) {
            updatedButtonRow.addComponents(
              new ButtonBuilder()
                .setCustomId('viewTicketStats')
                .setLabel('View Ticket Stats')
                .setStyle(ButtonStyle.Secondary)
            );
          }
        }

        await i.update({ embeds: [profileEmbed], components: [updatedButtonRow] });

        let clockedinout = new EmbedBuilder()
          .setTitle(profileData.clockedIn ? 'Clocked In!' : 'Clocked Out!') 
          .setDescription(profileData.clockedIn ? 'You have successfully clocked in.' : 'You have successfully clocked out.')
          .setColor(supportbot.Embed.Colours.General)

        await interaction.followUp({ embeds: [clockedinout], ephemeral: true });
      }

      if (i.customId === 'viewTicketStats') {
        const TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
        const ticketsClaimed = TicketData.tickets.filter(t => t.claimedBy === viewingUserId);
        const ticketsOpen = ticketsClaimed.filter(t => t.open);
        const totalTickets = ticketsClaimed.length;

        let totalResponseTime = 0;
        let responseCount = 0;

        ticketsClaimed.forEach(ticket => {
          if (ticket.claimedAt && ticket.createdAt) {
            const responseTime = new Date(ticket.claimedAt) - new Date(ticket.createdAt);
            totalResponseTime += responseTime;
            responseCount++;
          }
        });

        const averageResponseTime = responseCount ? totalResponseTime / responseCount : 0;
        const averageResponseTimeMinutes = Math.round(averageResponseTime / 60000);

        const statsEmbed = new EmbedBuilder()
          .setTitle(msgconfig.TicketStats.Title)
          .setDescription(`> Ticket stats for <@${viewingUserId}>`)
          .setColor(supportbot.Embed.Colours.General)
          .addFields(
            { name: msgconfig.TicketStats.OpenTickets, value: `${ticketsOpen.length}`, inline: true },
            { name: msgconfig.TicketStats.TotalTickets, value: `${totalTickets}`, inline: true },
            { name: msgconfig.TicketStats.ResponseTime, value: `${averageResponseTimeMinutes} minutes`, inline: false }
          );

        const statsButtonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('showOpenTickets')
              .setLabel('Show Open Tickets')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('backToProfile')
              .setLabel('Back to Profile')
              .setStyle(ButtonStyle.Secondary)
          );

        await i.update({ embeds: [statsEmbed], components: [statsButtonRow] });
      }

      if (i.customId === 'showOpenTickets') {
        const TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
        const ticketsOpen = TicketData.tickets.filter(t => t.claimedBy === viewingUserId && t.open);

        const openTicketsEmbed = new EmbedBuilder()
          .setTitle('Active Tickets')
          .setDescription(ticketsOpen.map(t => `<#${t.id}>`).join('\n') || 'No active tickets.')
          .setColor(supportbot.Embed.Colours.General);

        const openTicketsButtonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('backToStats')
              .setLabel('Back to Stats')
              .setStyle(ButtonStyle.Secondary)
          );

        await i.update({ embeds: [openTicketsEmbed], components: [openTicketsButtonRow] });
      }

      if (i.customId === 'backToStats') {
        const TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
        const ticketsClaimed = TicketData.tickets.filter(t => t.claimedBy === viewingUserId);
        const ticketsOpen = ticketsClaimed.filter(t => t.open);
        const totalTickets = ticketsClaimed.length;

        let totalResponseTime = 0;
        let responseCount = 0;

        ticketsClaimed.forEach(ticket => {
          if (ticket.claimedAt && ticket.createdAt) {
            const responseTime = new Date(ticket.claimedAt) - new Date(ticket.createdAt);
            totalResponseTime += responseTime;
            responseCount++;
          }
        });

        const averageResponseTime = responseCount ? totalResponseTime / responseCount : 0;
        const averageResponseTimeMinutes = Math.round(averageResponseTime / 60000);

        const statsEmbed = new EmbedBuilder()
          .setTitle(msgconfig.TicketStats.Title)
          .setDescription(`> Ticket stats for <@${viewingUserId}>`)
          .setColor(supportbot.Embed.Colours.General)
          .addFields(
            { name: msgconfig.TicketStats.OpenTickets, value: `${ticketsOpen.length}`, inline: true },
            { name: msgconfig.TicketStats.TotalTickets, value: `${totalTickets}`, inline: true },
            { name: msgconfig.TicketStats.ResponseTime, value: `${averageResponseTimeMinutes} minutes`, inline: false }
          );

        const statsButtonRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('showOpenTickets')
              .setLabel('Show Open Tickets')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('backToProfile')
              .setLabel('Back to Profile')
              .setStyle(ButtonStyle.Secondary)
          );

        await i.update({ embeds: [statsEmbed], components: [statsButtonRow] });
      }

      if (i.customId === 'backToProfile') {
        await i.update({ embeds: [profileEmbed], components: buttonRow.components.length > 0 ? [buttonRow] : [] });
      }
    });
  }
});

module.exports.clockedInUsers = clockedInUsers;
