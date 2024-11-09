const fs = require("fs");
const { ApplicationCommandOptionType, ApplicationCommandType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const yaml = require("js-yaml");
const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Command = require("../Structures/Command.js");

// Function to chunk array into smaller arrays
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

module.exports = new Command({
  name: cmdconfig.Mod.Command,
  description: cmdconfig.Mod.Command,
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: cmdconfig.Mod.TicketBlacklist.Command,
      description: cmdconfig.Mod.TicketBlacklist.Description,
      type: ApplicationCommandOptionType.SubcommandGroup,
      options: [
        {
          name: cmdconfig.Mod.TicketBlacklist.Add.Command,
          description: msgconfig.Mod.TicketBlacklist.Add.Description || "Add a user to the ticket blacklist",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: 'user',
              description: msgconfig.Mod.TicketBlacklist.Add.UserDescription || "User to blacklist",
              type: ApplicationCommandOptionType.User,
              required: true
            },
            {
              name: 'reason', 
              description: msgconfig.Mod.TicketBlacklist.Add.ReasonDescription || "Reason for blacklisting",
              type: ApplicationCommandOptionType.String,
              required: false
            }
          ]
        },
        {
          name: cmdconfig.Mod.TicketBlacklist.Remove.Command,
          description: msgconfig.Mod.TicketBlacklist.Remove.Description || "Remove a user from the ticket blacklist",
          type: ApplicationCommandOptionType.Subcommand,
          options: [
            {
              name: 'user',
              description: msgconfig.Mod.TicketBlacklist.Remove.UserDescription || "User to remove from blacklist",
              type: ApplicationCommandOptionType.User,
              required: true
            },
            {
              name: 'reason',
              description: msgconfig.Mod.TicketBlacklist.Remove.ReasonDescription || "Reason for removing from blacklist",
              type: ApplicationCommandOptionType.String,
              required: false
            }
          ]
        },
        {
          name: "view",
          description: msgconfig.Mod.TicketBlacklist.View.Description || "View all blacklisted users",
          type: ApplicationCommandOptionType.Subcommand,
        }
      ]
    }
  ],
  permissions: cmdconfig.Mod.Permission,

  async run(interaction) {
    const { getRole } = interaction.client;

    let SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
    let Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);
    let Moderator = await getRole(supportbot.Roles.StaffMember.Moderator, interaction.guild);

    if (!SupportStaff || !Admin || !Moderator) {
      const missingRolesEmbed = new EmbedBuilder()
        .setDescription(msgconfig.Error.InvalidChannel || "Required roles are missing!")
        .setColor(supportbot.Embed.Colours.Warn);
      return interaction.reply({ embeds: [missingRolesEmbed] });
    }

    const NoPerms = new EmbedBuilder()
      .setDescription(msgconfig.Error.IncorrectPerms || "You do not have the correct permissions!")
      .setColor(supportbot.Embed.Colours.Warn);

    if (!interaction.member.roles.cache.has(Admin.id) && !interaction.member.roles.cache.has(Moderator.id) && (!supportbot.Mod.AllowSupportStaff || !interaction.member.roles.cache.has(SupportStaff.id))) {
      return interaction.reply({ embeds: [NoPerms] });
    }

    const subcommand = interaction.options.getSubcommand(false);
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || "No reason provided"; 

    try {
      let blacklistedUsers;
      try {
        blacklistedUsers = JSON.parse(fs.readFileSync("./Data/BlacklistedUsers.json", "utf8")).blacklistedUsers;
        if (!Array.isArray(blacklistedUsers)) {
          blacklistedUsers = [];
        }
      } catch (error) {
        blacklistedUsers = [];
      }

      if (subcommand === cmdconfig.Mod.TicketBlacklist.Add.Command) {
        if (blacklistedUsers.includes(user.id)) {
          const alreadyBlacklistedEmbed = new EmbedBuilder()
            .setDescription(msgconfig.Mod.TicketBlacklist.Add.AlreadyBlacklisted.replace("{userTag}", user.tag) || ":x: User is already blacklisted.")
            .setColor(supportbot.Embed.Colours.Warn);
          return interaction.reply({ embeds: [alreadyBlacklistedEmbed], ephemeral: true });
        }

        blacklistedUsers.push(user.id);
        fs.writeFileSync("./Data/BlacklistedUsers.json", JSON.stringify({ "blacklistedUsers": blacklistedUsers }, null, 4));

        const successEmbed = new EmbedBuilder()
          .setDescription(msgconfig.Mod.TicketBlacklist.Add.Success.replace("{userTag}", user.tag) || ":white_check_mark: User has been blacklisted.")
          .setColor(supportbot.Embed.Colours.Success);

        const blacklistChannel = interaction.guild.channels.cache.get(supportbot.Ticket.Log.TicketBlacklistLog);
        if (blacklistChannel) {
          const blacklistLogEmbed = new EmbedBuilder()
            .setTitle(msgconfig.TicketBlacklistLog.Title || "Ticket Blacklist Log")
            .setColor(msgconfig.TicketBlacklistLog.Colour || supportbot.Embed.Colours.Success)
            .setFooter({ text: supportbot.Embed.Footer, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`> **User:** ${user.tag} (\`${user.id}\`)\n> **Actioned by:** <@${interaction.user.id}>`)
            .addFields({ name: "Action", value: "\`\`\`Removed from blacklist\`\`\`", inline: false })
            .addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false });

          blacklistChannel.send({ embeds: [blacklistLogEmbed] });
        }

        return interaction.reply({
          embeds: [successEmbed],
          ephemeral: true 
        });

      } else if (subcommand === cmdconfig.Mod.TicketBlacklist.Remove.Command) {
        if (!blacklistedUsers.includes(user.id)) {
          const notBlacklistedEmbed = new EmbedBuilder()
            .setDescription(msgconfig.Mod.TicketBlacklist.Remove.NotBlacklisted.replace("{userTag}", user.tag) || ":x: User is not blacklisted.")
            .setColor(supportbot.Embed.Colours.Warn);
          return interaction.reply({ embeds: [notBlacklistedEmbed], ephemeral: true });
        }

        blacklistedUsers = blacklistedUsers.filter(id => id !== user.id);
        fs.writeFileSync("./Data/BlacklistedUsers.json", JSON.stringify({ "blacklistedUsers": blacklistedUsers }, null, 4));

        const removedEmbed = new EmbedBuilder()
          .setDescription(msgconfig.Mod.TicketBlacklist.Remove.Success.replace("{userTag}", user.tag) || ":white_check_mark: User has been removed from the blacklist.")
          .setColor(supportbot.Embed.Colours.Success);

        const blacklistChannel = interaction.guild.channels.cache.get(supportbot.Ticket.Log.TicketBlacklistLog);
        if (blacklistChannel) {
          const blacklistLogEmbed = new EmbedBuilder()
            .setTitle(msgconfig.TicketBlacklistLog.Title || "Ticket Blacklist Log")
            .setColor(msgconfig.TicketBlacklistLog.Colour || supportbot.Embed.Colours.Success)
            .setFooter({ text: supportbot.Embed.Footer, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`> **User:** ${user.tag} (\`${user.id}\`)\n> **Actioned by:** <@${interaction.user.id}>`)
            .addFields({ name: "Action", value: "\`\`\`Removed from blacklist\`\`\`", inline: false })
            .addFields({ name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false });

          blacklistChannel.send({ embeds: [blacklistLogEmbed] });
        }

        return interaction.reply({ embeds: [removedEmbed], ephemeral: true });

      } else if (subcommand === "view") {
        if (blacklistedUsers.length === 0) {
          const noBlacklistedUsersEmbed = new EmbedBuilder()
            .setDescription(msgconfig.Mod.TicketBlacklist.View.NoBlacklistedUsers || "No users are blacklisted.")
            .setColor(supportbot.Embed.Colours.Success);
          return interaction.reply({ embeds: [noBlacklistedUsersEmbed], ephemeral: true });
        }

        const chunkedUsers = chunkArray(blacklistedUsers, 5);
        let currentPage = 0;

        const createEmbed = (page) => {
          return new EmbedBuilder()
            .setTitle(msgconfig.Mod.TicketBlacklist.View.EmbedTitle || "Blacklisted Users")
            .setDescription(chunkedUsers[page].map(id => `<@${id}>`).join("\n"))
            .setColor(supportbot.Embed.Colours.Success)
            .setFooter({ text: `Page ${page + 1} of ${chunkedUsers.length}` });
        };

        const buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('previous')
              .setLabel('Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('next')
              .setLabel('Next')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === chunkedUsers.length - 1)
          );

        const response = await interaction.reply({
          embeds: [createEmbed(currentPage)],
          components: chunkedUsers.length > 1 ? [buttons] : [],
          ephemeral: true
        });

        if (chunkedUsers.length <= 1) return;

        const collector = response.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000 
        });

        collector.on('collect', async (i) => {
          if (i.user.id !== interaction.user.id) {
            return i.reply({
              content: 'You cannot use these buttons.',
              ephemeral: true
            });
          }

          if (i.customId === 'previous' && currentPage > 0) {
            currentPage--;
          } else if (i.customId === 'next' && currentPage < chunkedUsers.length - 1) {
            currentPage++;
          }

          buttons.components[0].setDisabled(currentPage === 0);
          buttons.components[1].setDisabled(currentPage === chunkedUsers.length - 1);

          await i.update({
            embeds: [createEmbed(currentPage)],
            components: [buttons]
          });
        });

        collector.on('end', () => {
          buttons.components.forEach(button => button.setDisabled(true));
          interaction.editReply({
            components: [buttons]
          }).catch(() => {});
        });
      }
    } catch (error) {
      console.error("Error in mod command:", error);
      const errorEmbed = new EmbedBuilder()
        .setDescription(msgconfig.Error.ActionFailed || "An error occurred while processing your request.")
        .setColor(supportbot.Embed.Colours.Warn);
      interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});