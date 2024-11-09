const fs = require("fs");
const Discord = require("discord.js");
const yaml = require("js-yaml");

const supportbot = yaml.load(fs.readFileSync("./Configs/supportbot.yml", "utf8"));
const cmdconfig = yaml.load(fs.readFileSync("./Configs/commands.yml", "utf8"));
const msgconfig = yaml.load(fs.readFileSync("./Configs/messages.yml", "utf8"));

const Event = require("../Structures/Event.js");

let suggestions;
try {
  suggestions = require("../Data/SuggestionData.json");
} catch (error) {
  suggestions = {};
}

module.exports = new Event("interactionCreate", async (client, interaction) => {

  if (interaction.type === Discord.InteractionType.ApplicationCommand) {
    const command = client.commands.find(
      (cmd) => cmd.name.toLowerCase() === interaction.commandName
    );

    if (interaction.user.bot || !interaction.guild) return;

    const NotValid = new Discord.EmbedBuilder()
      .setDescription(`:x: \`Invalid Command\``)
      .setColor(supportbot.Embed.Colours.Error);

    if (!command)
      return interaction.reply({
        embeds: [NotValid],
        ephemeral: true,
      });

    const permission = interaction.member.permissions.has(command.permissions);

    const ValidPerms = new Discord.EmbedBuilder()
      .setDescription(
        "> :x: `Invalid Permissions` Do you have the correct permissions to execute this command?"
      )
      .setColor(supportbot.Embed.Colours.Error);

    if (!permission)
      return interaction.reply({
        embeds: [ValidPerms],
        ephemeral: true,
      });

    try {
      if (command.name === cmdconfig.OpenTicket.Command && supportbot.Ticket.TicketReason) {
        const modal = new Discord.ModalBuilder()
          .setCustomId("ticketReasonModal")
          .setTitle("Ticket Reason")
          .addComponents(
            new Discord.ActionRowBuilder().addComponents(
              new Discord.TextInputBuilder()
                .setCustomId("reasonInput")
                .setLabel("Reason")
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
      } else {
        console.log("\u001b[32m", "[Executed]", "\u001b[37;1m", `${interaction.user.username} has executed ${command.name}`);
        await command.run(interaction);
      }
    } catch (error) {
      console.error("Error executing command:", error);
      await interaction.reply({
        content: "An error occurred while executing the command.",
        ephemeral: true,
      });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ticketReasonModal") {
      const reason = interaction.fields.getTextInputValue("reasonInput");
      interaction.customId = `createticket-${reason}`;
      const cmd = client.commands.get(cmdconfig.OpenTicket.Command);
      if (cmd) {
        interaction.reason = reason; // Attach the reason to the interaction object
        await cmd.run(interaction);
      } else {
        console.error("Command not found.");
      }
    }
  }

  if (interaction.customId === "renameTicketModal") {
    const newTicketName = interaction.fields.getTextInputValue("renameTicket");

    // Fixing the ticketChannelId extraction and lookup
    const ticketChannelId = interaction.channel.id;

    let ticketChannel;
    if (supportbot.Ticket.TicketType === "threads") {
        ticketChannel = interaction.guild.channels.cache.get(ticketChannelId);
    } else if (supportbot.Ticket.TicketType === "channels") {
        ticketChannel = interaction.guild.channels.cache.get(ticketChannelId);
    }

    if (!ticketChannel) {
        return interaction.reply({
            content: "Ticket channel not found.",
            ephemeral: true,
        });
    }

    try {
        await ticketChannel.setName(newTicketName);

        const renamedsuccess = new Discord.EmbedBuilder()
            .setDescription(msgconfig.Ticket.RenamedSuccess)
            .setColor(supportbot.Embed.Colours.Success);

        return interaction.reply({
            embeds: [renamedsuccess],
            ephemeral: true,
        });
    } catch (error) {
        console.error("Error renaming the ticket:", error);
        return interaction.reply({
            content: "There was an error renaming the ticket.",
            ephemeral: true,
        });
    }
}
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticketcontrolpanel") {
      const selectedOption = interaction.values[0];
      const { getRole, getChannel } = interaction.client;
      switch (selectedOption) {

        case "ticketclose":
          const closeCommand = client.commands.get(cmdconfig.CloseTicket.Command);
          if (closeCommand) {
            await closeCommand.run(interaction);
          } else {
            console.error("[X] Close Command Not Found");
          }
          break;

          case "supportvc":
            const ticketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
            const ticketInfo = ticketData.tickets.find(t => t.id === interaction.channel.id);
        
            if (ticketInfo) {
              const user = interaction.guild.members.cache.get(ticketInfo.user) || ticketInfo.user;
              const claimedBy = interaction.guild.members.cache.get(ticketInfo.claimedBy) || ticketInfo.claimedBy;
              const Admin = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Admin);
              const Staff = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Staff);

              const VCcategory = interaction.guild.channels.cache.find(
                (c) => c.name === supportbot.VoiceTickets.Category || c.id === supportbot.VoiceTickets.Category
              );
      
              if (!VCcategory) {
                return interaction.reply({
                  content: "The Support VC category does not exist!",
                  ephemeral: true,
                });
              }

              let username = user ? user.user.username : "Unknown User"; 

              let SupportVoice = await interaction.guild.channels.create({
                name: supportbot.VoiceTickets.Name.replace(/%username%/g, username),
                type: Discord.ChannelType.GuildVoice,
                parent: VCcategory,
                permissionOverwrites: [
                  {
                    id: user,
                    allow: [
                      Discord.PermissionsBitField.Flags.Connect,
                      Discord.PermissionsBitField.Flags.Speak,
                      Discord.PermissionsBitField.Flags.ViewChannel,
                    ],
                  },
                  {
                    id: Staff,
                    allow: [
                      Discord.PermissionsBitField.Flags.Connect,
                      Discord.PermissionsBitField.Flags.Speak,
                      Discord.PermissionsBitField.Flags.ViewChannel,
                    ],
                  },
                  {
                    id: Admin,
                    allow: [
                      Discord.PermissionsBitField.Flags.Connect,
                      Discord.PermissionsBitField.Flags.Speak,
                      Discord.PermissionsBitField.Flags.ViewChannel,
                    ],
                  },
                  {
                    id: interaction.guild.id,
                    deny: [Discord.PermissionsBitField.Flags.ViewChannel],
                  },
                ],
              });

              ticketInfo.voiceChannelId = SupportVoice.id;
              
              fs.writeFileSync("./Data/TicketData.json", JSON.stringify(ticketData, null, 2));
              
              const VCDeleteButton = new Discord.ButtonBuilder()
                .setCustomId("deleteSupportVC")
                .setLabel(supportbot.Buttons.Voice.TicketDeleteText)
                .setEmoji(supportbot.Buttons.General.Delete)
                .setStyle(supportbot.Buttons.General.DeleteStyle);
              
              const VCDeleteRow = new Discord.ActionRowBuilder().addComponents(VCDeleteButton);
              
              const vcmadeembed = new Discord.EmbedBuilder()
                .setDescription(`> **Support VC Created:** <#${SupportVoice.id}>`)
                .setColor(supportbot.Embed.Colours.Success);
              
              await interaction.reply({
                embeds: [vcmadeembed],
                components: [VCDeleteRow],
              });

            }
          break;

          case "archiveticket":
              const arcembed = new Discord.EmbedBuilder()
                .setDescription(msgconfig.Ticket.TicketArchived)
                .setColor(supportbot.Embed.Colours.Success);

              const CloseButton = new Discord.ButtonBuilder()
                .setCustomId("confirmCloseTicket")
                .setLabel(supportbot.Ticket.Close.Confirmation_Button)
                .setEmoji(supportbot.Ticket.Close.Confirmation_Emoji)
                .setStyle(supportbot.Ticket.Close.Confirmation_Style);

              const unarchiveButton = new Discord.ButtonBuilder()
                .setCustomId("unarchiveTicket")
                .setLabel(supportbot.Buttons.Tickets.Unarchive)
                .setEmoji(supportbot.Buttons.Tickets.Unarchive_Emoji)
                .setStyle(supportbot.Buttons.Tickets.Unarchive_Style);

              const ArchivedOptions = new Discord.ActionRowBuilder() 
                .addComponents(CloseButton, unarchiveButton);

                await interaction.channel.send({
                  embeds: [arcembed],
                  components: [ArchivedOptions],
                });

                if (supportbot.Ticket.TicketType === "threads") {
                  await interaction.channel.setArchived(true);
                }
              
                if (supportbot.Ticket.TicketType === "channels") {
                  const { getRole, getChannel } = interaction.client;
                  await interaction.channel.setParent(supportbot.Ticket.TicketArchiveCategory);

                  const ticketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
                  const ticketInfo = ticketData.tickets.find(t => t.id === interaction.channel.id);
              
                  if (ticketInfo) {
                    const user = interaction.guild.members.cache.get(ticketInfo.user) || ticketInfo.user;
                    const claimedBy = interaction.guild.members.cache.get(ticketInfo.claimedBy) || ticketInfo.claimedBy;
                    const Admin = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Admin);
                    const Staff = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Staff);
              
                    if (user && user.id) {
                      await interaction.channel.permissionOverwrites.edit(user.id, {
                        ViewChannel: false,
                        SendMessages: false,
                      });
                    }
              
                    if (supportbot.ClaimTickets === true) {
                      if (claimedBy && claimedBy.id) {
                        await interaction.channel.permissionOverwrites.edit(claimedBy.id, {
                          ViewChannel: true,
                          SendMessages: true,
                          ReadMessageHistory: true,
                        });
                      }  
                    }
  
                    if (supportbot.ClaimTickets === false) {
                      if (Staff && Staff.id) {
                        await interaction.channel.permissionOverwrites.edit(claimedBy.id, {
                          ViewChannel: true,
                          SendMessages: true,
                          ReadMessageHistory: true,
                        });
                      }  
                    }
              
                    if (Admin && Admin.id) {
                      await interaction.channel.permissionOverwrites.edit(Admin.id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                      });
                    }
              
                    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
                      ViewChannel: false,
                      SendMessages: false,
                      ReadMessageHistory: false,
                    });
                  }
            
                }

                break;

                case "lockticket":
                  const lockembed = new Discord.EmbedBuilder()
                    .setDescription(msgconfig.Ticket.TicketLocked)
                    .setColor(supportbot.Embed.Colours.Success);
              
                  const unlockButton = new Discord.ButtonBuilder()
                    .setCustomId("unlockTicket")
                    .setLabel(supportbot.Buttons.Tickets.Unlock)
                    .setEmoji(supportbot.Buttons.Tickets.Unlock_Emoji)
                    .setStyle(supportbot.Buttons.Tickets.Unlock_Style);
              
                  const LockedOptions = new Discord.ActionRowBuilder()
                    .addComponents(unlockButton);
              
                  await interaction.channel.send({
                    embeds: [lockembed],
                    components: [LockedOptions],
                    ephemeral: false, 
                  });
              

                  if (supportbot.Ticket.TicketType === "threads") {
                    await interaction.channel.setLocked(true);  
                  }
              
                  break;

                  case "unlockTicket":
                    const unlockEmbed = new Discord.EmbedBuilder()
                      .setDescription(msgconfig.Ticket.TicketUnlocked)
                      .setColor(supportbot.Embed.Colours.Success);
                
                    await interaction.channel.send({
                      embeds: [unlockEmbed],
                      ephemeral: false,
                    });
                
                    if (supportbot.Ticket.TicketType === "threads") {
                      await interaction.channel.setLocked(false);  
                    }
                
                    break;
              
        case "enableinvites":
          await handleInvites(interaction, true);
          break;

        case "disableinvites":
          await handleInvites(interaction, false);
          break;

        case "renameticket":
          const modal = new Discord.ModalBuilder()
          .setCustomId("renameTicketModal")
          .setTitle("Rename Channel")
          .addComponents(
            new Discord.ActionRowBuilder()
              .addComponents(
                new Discord.TextInputBuilder()
                  .setCustomId("renameTicket")
                  .setLabel("New Channel Name")
                  .setStyle(Discord.TextInputStyle.Short)
                  .setRequired(true)
                )
              );
            await interaction.showModal(modal);
            break;

      }
    }
  }

  if (interaction.customId === 'deleteSupportVC') {
    const ticketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
    const ticketInfo = ticketData.tickets.find(t => t.id === interaction.channel.id);
  
    if (ticketInfo && ticketInfo.voiceChannelId) {
      try {
        const voiceChannel = await interaction.guild.channels.fetch(ticketInfo.voiceChannelId).catch(() => null);
  
        if (voiceChannel) {
          await voiceChannel.delete();
  
          const successEmbed = new Discord.EmbedBuilder()
            .setDescription('✅ Support voice channel has been successfully deleted!')
            .setColor(supportbot.Embed.Colours.Success);
  
          await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true,
          });
  
          ticketInfo.voiceChannelId = null; 
          fs.writeFileSync("./Data/TicketData.json", JSON.stringify(ticketData, null, 2));
        } else {
          const errorEmbed = new Discord.EmbedBuilder()
            .setDescription('❌ The associated voice channel could not be found.')
            .setColor(supportbot.Embed.Colours.Error);
  
          await interaction.reply({
            embeds: [errorEmbed],
            ephemeral: true,
          });
        }
      } catch (error) {
        console.error('Error deleting the Voice Channel:', error);
  
        const errorEmbed = new Discord.EmbedBuilder()
          .setDescription('❌ **There was an error trying to delete this voice channel. Please try again later.**')
          .setColor(supportbot.Embed.Colours.Error);
  
        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true,
        });
      }
    } else {
      const errorEmbed = new Discord.EmbedBuilder()
        .setDescription('⚠️ This button is not linked to a valid voice channel.')
        .setColor(supportbot.Embed.Colours.Warn);
  
      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true,
      });
    }
  }
  


  if (interaction.isButton()) {
    if (interaction.customId === "unarchiveTicket") {

      if (supportbot.Ticket.TicketType === "threads") {
        await interaction.channel.setArchived(false);
      }
    
      if (supportbot.Ticket.TicketType === "channels") {
        const { getRole, getChannel } = interaction.client;
        await interaction.channel.setParent(supportbot.Ticket.TicketChannelsCategory);

        const ticketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
        const ticketInfo = ticketData.tickets.find(t => t.id === interaction.channel.id);
      
        if (ticketInfo) {
          const user = interaction.guild.members.cache.get(ticketInfo.user) || ticketInfo.user;
          const claimedBy = interaction.guild.members.cache.get(ticketInfo.claimedBy) || ticketInfo.claimedBy;
          const Admin = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Admin);
          const Staff = await interaction.guild.roles.fetch(supportbot.Roles.StaffMember.Staff);
      
          if (user && user.id) {
            await interaction.channel.permissionOverwrites.edit(user.id, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            });
          }
      
          if (supportbot.ClaimTickets === true) {
            if (claimedBy && claimedBy.id) {
              await interaction.channel.permissionOverwrites.edit(claimedBy.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
              });
            }  
          }

          if (supportbot.ClaimTickets === false) {
            if (Staff && Staff.id) {
              await interaction.channel.permissionOverwrites.edit(claimedBy.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
              });
            }  
          }
      
          if (Admin && Admin.id) {
            await interaction.channel.permissionOverwrites.edit(Admin.id, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            });
          }
      
          await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false,
          });
        }
      }
    
      const unrcembed = new Discord.EmbedBuilder()
        .setDescription(msgconfig.Ticket.TicketUnarchived)
        .setColor(supportbot.Embed.Colours.Success);
    
      await interaction.update({
        embeds: [unrcembed],
        components: [],
      });
    
    }

    if (interaction.customId === "createticket") {
      if (supportbot.Ticket.TicketReason) {
        const modal = new Discord.ModalBuilder()
          .setCustomId("ticketReasonModal")
          .setTitle("Ticket Reason")
          .addComponents(
            new Discord.ActionRowBuilder().addComponents(
              new Discord.TextInputBuilder()
                .setCustomId("reasonInput")
                .setLabel("Reason")
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
      } else {
        try {
          const cmd = client.commands.get(cmdconfig.OpenTicket.Command);
          if (!cmd) return;
          await cmd.run(interaction);
        } catch (error) {
          console.error("Error executing the ticket command:", error);
          await interaction.reply({
            content: "An error occurred while creating the ticket.",
            ephemeral: true,
          });
        }
      }
    }

    if (interaction.customId === "openticket") {
      if (supportbot.Ticket.TicketReason) {
        const modal = new Discord.ModalBuilder()
          .setCustomId("ticketReasonModal")
          .setTitle("Ticket Reason")
          .addComponents(
            new Discord.ActionRowBuilder().addComponents(
              new Discord.TextInputBuilder()
                .setCustomId("reasonInput")
                .setLabel("Reason")
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
      } else {
        try {
          const cmd = client.commands.get(cmdconfig.OpenTicket.Command);
          if (!cmd) return;
          await cmd.run(interaction);
        } catch (error) {
          console.error(error);
        }
      }
    }

    if (interaction.customId.startsWith("claimticket-")) {
      const ticketChannelId = interaction.customId.split("-")[1];
      const ticketChannel = interaction.guild.channels.cache.get(ticketChannelId);
      if (!ticketChannel) {
        return interaction.reply({
          content: "Ticket channel not found.",
          ephemeral: true,
        });
      }

      const { getRole, getChannel } = interaction.client;
      const Staff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      const RolePerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(
          `${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``
        )
        .setColor(supportbot.Embed.Colours.Warn);

      if (!Staff || !Admin) {
        return interaction.reply({
          embeds: [RolePerms],
          ephemeral: true,
        });
      }

      const NoPermsClaim = new Discord.EmbedBuilder()
        .setTitle(msgconfig.Ticket.ClaimTickets.NoPermsToClaimTitle)
        .setDescription(
          msgconfig.Ticket.ClaimTickets.NoPermsToClaim.replace("%channel%", ticketChannel.name)
        )
        .setColor(supportbot.Embed.Colours.Error);

      if (!interaction.member.roles.cache.has(Staff.id) && !interaction.member.roles.cache.has(Admin.id)) {
        return interaction.reply({
          embeds: [NoPermsClaim],
          ephemeral: true,
        });
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
    
      const pingclaimedstaff = await ticketChannel.send(`<@${interaction.user.id}>`);

      setTimeout(() => {
        pingclaimedstaff.delete();
      }, 2000);

      const TicketData = JSON.parse(fs.readFileSync("./Data/TicketData.json", "utf8"));
      const ticketIndex = TicketData.tickets.findIndex((t) => t.id === ticketChannelId);
      if (ticketIndex !== -1) {
        TicketData.tickets[ticketIndex].claimedBy = interaction.user.id;
        TicketData.tickets[ticketIndex].claimedAt = new Date().toISOString();
        fs.writeFileSync("./Data/TicketData.json", JSON.stringify(TicketData, null, 4));
      }

      const claimMessage = await interaction.message.fetch();
      const claimedEmbed = new Discord.EmbedBuilder(claimMessage.embeds[0].data)
        .setTitle(msgconfig.Ticket.ClaimTickets.ClaimedTitle)
        .setDescription(
          msgconfig.Ticket.ClaimTickets.ClaimMessage_Edit.replace("%user%", interaction.user.id).replace("%channel%", ticketChannel.id)
        )
        .setColor(supportbot.Embed.Colours.Success);

      const successfullyClaimed = new Discord.EmbedBuilder()
        .setTitle(msgconfig.Ticket.ClaimTickets.ClaimedTitle)
        .setDescription(msgconfig.Ticket.ClaimTickets.Claimed.replace("%channel%", ticketChannel.id))
        .setColor(supportbot.Embed.Colours.Success);

      await claimMessage.edit({ embeds: [claimedEmbed], components: [] });
      await interaction.reply({
        embeds: [successfullyClaimed],
        ephemeral: true,
      });
    }

    // SUGGESTION INTERACTIONS [START]

    if (
      interaction.customId === "upvote" ||
      interaction.customId === "downvote" ||
      interaction.customId === "removevote"
    ) {
      const suggestion = suggestions[interaction.message.id];
      if (!suggestion)
        return interaction.reply({ content: "Suggestion not found.", ephemeral: true });

      const userId = interaction.user.id;
      const hasUpvoted = suggestion.upvotes.includes(userId);
      const hasDownvoted = suggestion.downvotes.includes(userId);

      if (interaction.customId === "upvote") {
        if (hasUpvoted) {
          suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
        } else {
          suggestion.upvotes.push(userId);
          if (hasDownvoted) {
            suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);
          }
        }
      } else if (interaction.customId === "downvote") {
        if (hasDownvoted) {
          suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);
        } else {
          suggestion.downvotes.push(userId);
          if (hasUpvoted) {
            suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
          }
        }
      } else if (interaction.customId === "removevote") {
        suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
        suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);
      }

      fs.writeFileSync("./Data/SuggestionData.json", JSON.stringify(suggestions, null, 2));

      const upvoteCount = suggestion.upvotes.length;
      const downvoteCount = suggestion.downvotes.length;

      const updatedEmbed = new Discord.EmbedBuilder(interaction.message.embeds[0].data).setFields([
        { name: "Suggestion", value: suggestion.suggestion, inline: true },
        { name: "From", value: `<@${suggestion.author}>` },
        {
          name: `${supportbot.Suggestions.UpvoteEmoji} ${supportbot.Suggestions.UpvoteTitle}`,
          value: `${upvoteCount}`,
          inline: true,
        },
        {
          name: `${supportbot.Suggestions.DownvoteEmoji} ${supportbot.Suggestions.DownvoteTitle}`,
          value: `${downvoteCount}`,
          inline: true,
        },
      ]);

      await interaction.update({ embeds: [updatedEmbed] });
    }

  }

  async function handleInvites(interaction, enable) {
    if (supportbot.Ticket.Invites.StaffOnly) {
      const { getRole, getChannel } = interaction.client;
      const SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
      const Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

      if (!SupportStaff || !Admin) {
        return interaction.reply(
          "Some roles seem to be missing!\nPlease check for errors when starting the bot."
        );
      }

      const NoPerms = new Discord.EmbedBuilder()
        .setTitle("Invalid Permissions!")
        .setDescription(
          `${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``
        )
        .setColor(supportbot.Embed.Colours.Warn);

      if (
        !interaction.member.roles.cache.has(SupportStaff.id) &&
        !interaction.member.roles.cache.has(Admin.id)
      ) {
        return interaction.reply({ embeds: [NoPerms] });
      }
    }

    await interaction.channel.setInvitable(enable);

    const message = enable ? msgconfig.Ticket.EnableInvites : msgconfig.Ticket.DisableInvites;
    const embed = new Discord.EmbedBuilder().setDescription(message).setColor(supportbot.Embed.Colours.General);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  // Modal submission handler for editing profile
  if (interaction.type === Discord.InteractionType.ModalSubmit && interaction.customId === "editProfileModal") {
    const userId = interaction.user.id;
    const profilePath = `./Data/Profiles/${userId}.json`;

    let profileData;
    if (fs.existsSync(profilePath)) {
      profileData = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    } else {
      profileData = {
        bio: "",
        timezone: "",
        clockedIn: false,
      };
    }

    try {
      const newBio = interaction.fields.getTextInputValue("bio");
      const newTimezone = interaction.fields.getTextInputValue("timezone");

      profileData.bio = newBio;
      profileData.timezone = newTimezone;

      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));

      const updatedProfileEmbed = new Discord.EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Profile`)
        .setColor(supportbot.Embed.Colours.General)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: "Bio", value: newBio || "No bio set.", inline: false },
          { name: "Timezone", value: newTimezone || "No timezone set.", inline: true }
        );

      if (profileData.clockedIn !== undefined) {
        updatedProfileEmbed.addFields({
          name: "Clocked In Status",
          value: profileData.clockedIn ? "✅ Clocked In" : "❌ Clocked Out",
          inline: true,
        });
      }

      await interaction.reply({ embeds: [updatedProfileEmbed], ephemeral: true });
    } catch (error) {
      console.error("Failed to update profile data: ", error);
      await interaction.reply({
        content: "There was an error while updating your profile. Please try again later.",
        ephemeral: true,
      });
    }
  }
});
