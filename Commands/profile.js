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

function formatSchedule(schedule) {
  if (!schedule || Object.keys(schedule).length === 0) return 'No schedule set';
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days
    .filter(day => schedule[day])
    .map(day => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${schedule[day].start} - ${schedule[day].end}`)
    .join('\n');
}

function calculateWeeklyHours(schedule) {
  if (!schedule) return 0;
  
  let totalMinutes = 0;
  Object.values(schedule).forEach(day => {
    if (day && day.start && day.end) {
      const [startHour, startMin] = day.start.split(':').map(Number);
      const [endHour, endMin] = day.end.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      totalMinutes += endMinutes - startMinutes;
    }
  });
  
  return Math.round(totalMinutes / 60 * 10) / 10; // Round to 1 decimal place
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
    const { getRole } = interaction.client;

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
        clockedIn: false,
        schedule: {}
      };
      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
    }

    const { bio, timezone, clockedIn, schedule } = profileData;
    const weeklyHours = calculateWeeklyHours(schedule);

    let profileEmbed = new EmbedBuilder()
      .setTitle(`${viewingUser.username}'s Profile`)
      .setColor(supportbot.Embed.Colours.General)
      .setThumbnail(viewingUser.displayAvatarURL())
      .addFields(
        { name: 'Bio', value: bio || 'No bio set.', inline: false },
        { name: 'Timezone', value: timezone || 'No timezone set.', inline: true }
      );

    if (isStaff) {
      profileEmbed.addFields(
        { name: 'Clocked In Status', value: clockedIn ? '✅ Clocked In' : '❌ Clocked Out', inline: true },
        { name: 'Weekly Hours', value: `${weeklyHours} hours`, inline: true }, // Now inline with Schedule
        { name: 'Schedule', value: formatSchedule(schedule), inline: true }
      );
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
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('editSchedule')
            .setLabel('Edit Schedule')
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
      ['editProfile', 'clockInOut', 'viewTicketStats', 'editSchedule'].includes(i.customId) 
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
                .setValue(profileData.bio || '')
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('timezone')
                .setLabel('Timezone')
                .setStyle(TextInputStyle.Short)
                .setValue(profileData.timezone || '')
                .setRequired(false)
            )
          );

        await i.showModal(modal);
      }

      if (i.customId === 'clockInOut') {
        profileData.clockedIn = !profileData.clockedIn;
        fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));

        if (profileData.clockedIn) {
          clockedInUsers.add(viewingUserId);
        } else {
          clockedInUsers.delete(viewingUserId);
        }

        profileEmbed = updateClockedInStatus(profileEmbed, profileData.clockedIn);
        const updatedRow = new ActionRowBuilder().addComponents(
          ...buttonRow.components.map(button => {
            if (button.data.custom_id === 'clockInOut') {
              return new ButtonBuilder()
                .setCustomId('clockInOut')
                .setLabel(profileData.clockedIn ? 'Clock Out' : 'Clock In')
                .setStyle(ButtonStyle.Secondary);
            }
            return ButtonBuilder.from(button.data);
          })
        );

        await i.update({ embeds: [profileEmbed], components: [updatedRow] });
      }

      if (i.customId === 'viewTicketStats') {
        // Handle ticket stats viewing here
        const ticketStatsEmbed = new EmbedBuilder()
          .setTitle('Ticket Stats')
          .setDescription('Here are your ticket stats...')
          .setColor(supportbot.Embed.Colours.General);

        await i.update({ embeds: [ticketStatsEmbed], components: [] });
      }

      if (i.customId === 'editSchedule') {
        const modal = new ModalBuilder()
          .setCustomId('editScheduleModal')
          .setTitle('Edit Schedule');

        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach(day => {
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(`${day.toLowerCase()}Start`)
                .setLabel(`${day} Start Time (HH:mm)`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(schedule[day.toLowerCase()]?.start || '')
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(`${day.toLowerCase()}End`)
                .setLabel(`${day} End Time (HH:mm)`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(schedule[day.toLowerCase()]?.end || '')
            )
          );
        });

        await i.showModal(modal);
      }
    });
  }
});
