const { 
  ApplicationCommandType, 
  ApplicationCommandOptionType,
  ActionRowBuilder, 
  ButtonBuilder, 
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const Command = require('../Structures/Command.js');
const fs = require('fs');
const yaml = require('js-yaml');

const supportbot = yaml.load(fs.readFileSync('./Configs/supportbot.yml', 'utf8'));
const cmdconfig = yaml.load(fs.readFileSync('./Configs/commands.yml', 'utf8'));
const msgconfig = yaml.load(fs.readFileSync('./Configs/messages.yml', 'utf8'));

// Helper function to validate and convert hex color
function parseColor(color) {
  if (!color) return 0x5865F2;
  if (typeof color === 'number') return color;
  if (typeof color !== 'string') return 0x5865F2;
  color = color.replace('#', '');
  if (/^[0-9A-F]{6}$/i.test(color)) {
    return parseInt(color, 16);
  }
  return 0x5865F2;
}

module.exports = new Command({
  name: cmdconfig.Embed.Command,
  description: cmdconfig.Embed.Description,
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'channel',
      description: 'Select channel to send the message',
      type: ApplicationCommandOptionType.Channel,
      required: true
    }
  ],
  permissions: cmdconfig.Embed.Permission,

  async run(interaction) {
    // Permission check
    const { getRole } = interaction.client;
    let SupportStaff = await getRole(supportbot.Roles.StaffMember.Staff, interaction.guild);
    let Admin = await getRole(supportbot.Roles.StaffMember.Admin, interaction.guild);

    if (!SupportStaff || !Admin) {
      return interaction.reply('Some roles seem to be missing!\nPlease check for errors when starting the bot.');
    }

    if (!interaction.member.roles.cache.has(SupportStaff.id) && 
        !interaction.member.roles.cache.has(Admin.id)) {
      const NoPerms = new EmbedBuilder()
        .setTitle('Invalid Permissions!')
        .setDescription(`${msgconfig.Error.IncorrectPerms}\n\nRole Required: \`${supportbot.Roles.StaffMember.Staff}\` or \`${supportbot.Roles.StaffMember.Admin}\``)
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [NoPerms], ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    
    // Initial message state
    const messageData = {
      type: 'embed',
      title: 'New Embed',
      description: 'Click the buttons below to edit this embed',
      color: 0x5865F2,
      fields: [],
      footer: null,
      thumbnail: null,
      image: null,
      timestamp: false
    };

    // Create initial embed
    function createEmbed() {
      const embed = new EmbedBuilder()
        .setTitle(messageData.title)
        .setDescription(messageData.description)
        .setColor(messageData.color);

      if (messageData.fields.length > 0) {
        embed.addFields(messageData.fields);
      }
      if (messageData.footer) {
        embed.setFooter({ text: messageData.footer });
      }
      if (messageData.thumbnail) {
        embed.setThumbnail(messageData.thumbnail);
      }
      if (messageData.image) {
        embed.setImage(messageData.image);
      }
      if (messageData.timestamp) {
        embed.setTimestamp();
      }

      return embed;
    }

    // Create type selector
    const typeRow = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('message_type')
          .setPlaceholder('Select message type')
          .addOptions([
            {
              label: 'Embed Message',
              description: 'Send as an embedded message',
              value: 'embed'
            },
            {
              label: 'Text Message',
              description: 'Send as a plain text message',
              value: 'text'
            }
          ])
      );

    // Create button rows function
    function createButtons(messageType) {
      const buttons = [];
      
      if (messageType === 'embed') {
        // Only show these buttons for embed mode
        const row1 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('edit_title')
              .setLabel('Edit Title')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('edit_description')
              .setLabel('Edit Description')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('edit_color')
              .setLabel('Edit Color')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('add_field')
              .setLabel('Add Field')
              .setStyle(ButtonStyle.Secondary)
          );

        const row2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('edit_footer')
              .setLabel('Edit Footer')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('edit_image')
              .setLabel('Add Image')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('edit_thumbnail')
              .setLabel('Add Thumbnail')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('toggle_timestamp')
              .setLabel('Toggle Timestamp')
              .setStyle(ButtonStyle.Secondary)
          );
        
        buttons.push(row1, row2);
      } else {
        // Text mode only shows edit text button
        const textRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('edit_description')
              .setLabel('Edit Text')
              .setStyle(ButtonStyle.Secondary)
          );
        
        buttons.push(textRow);
      }

      // Send button always shows
      const sendRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('send_message')
            .setLabel('Send')
            .setStyle(ButtonStyle.Success)
        );
      
      buttons.push(sendRow);
      return buttons;
    }

    // Function to update the message preview
    async function updatePreview(i) {
      if (messageData.type === 'embed') {
        await i.update({
          content: 'Customize your message:',
          embeds: [createEmbed()],
          components: [typeRow, ...createButtons('embed')]
        });
      } else {
        // For text mode, just show the text directly
        await i.update({
          content: messageData.description,
          embeds: [],
          components: [typeRow, ...createButtons('text')]
        });
      }
    }

    // Send initial message
    const message = await interaction.reply({
      content: messageData.type === 'text' ? messageData.description : 'Customize your message:',
      components: [typeRow, ...createButtons(messageData.type)],
      embeds: messageData.type === 'embed' ? [createEmbed()] : [],
      ephemeral: true
    });

    // Create collector for interactions
    const collector = message.createMessageComponentCollector({
      time: 900000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ 
          content: 'You cannot edit this message.', 
          ephemeral: true 
        });
      }

      switch (i.customId) {
        case 'message_type':
          messageData.type = i.values[0];
          await updatePreview(i);
          break;

        case 'edit_description':
          const descModal = new ModalBuilder()
            .setCustomId('desc_modal')
            .setTitle(messageData.type === 'embed' ? 'Edit Description' : 'Edit Text');

          descModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('desc_input')
                  .setLabel(messageData.type === 'embed' ? 'Description' : 'Message Text')
                  .setStyle(TextInputStyle.Paragraph)
                  .setValue(messageData.description)
                  .setMaxLength(4000)
              )
          );

          await i.showModal(descModal);
          break;

        case 'edit_title':
          const titleModal = new ModalBuilder()
            .setCustomId('title_modal')
            .setTitle('Edit Title');

          titleModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('title_input')
                  .setLabel('Title')
                  .setStyle(TextInputStyle.Short)
                  .setValue(messageData.title)
                  .setMaxLength(256)
              )
          );

          await i.showModal(titleModal);
          break;

        case 'edit_color':
          const colorModal = new ModalBuilder()
            .setCustomId('color_modal')
            .setTitle('Edit Color');

          colorModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('color_input')
                  .setLabel('Color (HEX)')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('#FF0000')
                  .setMinLength(6)
                  .setMaxLength(7)
                  .setValue(messageData.color.toString(16).padStart(6, '0'))
              )
          );

          await i.showModal(colorModal);
          break;

        case 'add_field':
          const fieldModal = new ModalBuilder()
            .setCustomId('field_modal')
            .setTitle('Add Field');

          fieldModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('field_name')
                  .setLabel('Field Name')
                  .setStyle(TextInputStyle.Short)
                  .setMaxLength(256)
              ),
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('field_value')
                  .setLabel('Field Value')
                  .setStyle(TextInputStyle.Paragraph)
                  .setMaxLength(1024)
              ),
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('field_inline')
                  .setLabel('Inline? (true/false)')
                  .setStyle(TextInputStyle.Short)
                  .setValue('false')
                  .setPlaceholder('true or false')
              )
          );

          await i.showModal(fieldModal);
          break;

        case 'edit_footer':
          const footerModal = new ModalBuilder()
            .setCustomId('footer_modal')
            .setTitle('Edit Footer');

          footerModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('footer_input')
                  .setLabel('Footer Text')
                  .setStyle(TextInputStyle.Short)
                  .setValue(messageData.footer || '')
                  .setMaxLength(2048)
              )
          );

          await i.showModal(footerModal);
          break;

        case 'edit_image':
          const imageModal = new ModalBuilder()
            .setCustomId('image_modal')
            .setTitle('Add Image');

          imageModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('image_input')
                  .setLabel('Image URL')
                  .setStyle(TextInputStyle.Short)
                  .setValue(messageData.image || '')
                  .setPlaceholder('https://example.com/image.png')
              )
          );

          await i.showModal(imageModal);
          break;

        case 'edit_thumbnail':
          const thumbnailModal = new ModalBuilder()
            .setCustomId('thumbnail_modal')
            .setTitle('Add Thumbnail');

          thumbnailModal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('thumbnail_input')
                  .setLabel('Thumbnail URL')
                  .setStyle(TextInputStyle.Short)
                  .setValue(messageData.thumbnail || '')
                  .setPlaceholder('https://example.com/thumbnail.png')
              )
          );

          await i.showModal(thumbnailModal);
          break;

        case 'toggle_timestamp':
          messageData.timestamp = !messageData.timestamp;
          await updatePreview(i);
          break;

        case 'send_message':
          try {
            if (messageData.type === 'embed') {
              await channel.send({ embeds: [createEmbed()] });
            } else {
              await channel.send(messageData.description);
            }
            await i.update({ 
              content: 'Message sent successfully!', 
              components: [], 
              embeds: [] 
            });
            collector.stop();
          } catch (error) {
            await i.reply({ 
              content: 'Failed to send message. Please check channel permissions.', 
              ephemeral: true 
            });
          }
          break;
      }
    });

    // Handle modal submissions
    interaction.client.on('interactionCreate', async (modal) => {
      if (!modal.isModalSubmit()) return;
      if (modal.user.id !== interaction.user.id) return;

      switch (modal.customId) {
        case 'title_modal':
          messageData.title = modal.fields.getTextInputValue('title_input');
          break;
        case 'desc_modal':
          messageData.description = modal.fields.getTextInputValue('desc_input');
          break;
        case 'color_modal':
          messageData.color = parseColor(modal.fields.getTextInputValue('color_input'));
          break;
        case 'field_modal':
          const inlineValue = modal.fields.getTextInputValue('field_inline').toLowerCase();
          messageData.fields.push({
            name: modal.fields.getTextInputValue('field_name'),
            value: modal.fields.getTextInputValue('field_value'),
            inline: inlineValue === 'true'
          });
          break;
        case 'footer_modal':
          messageData.footer = modal.fields.getTextInputValue('footer_input');
          break;
        case 'image_modal':
          messageData.image = modal.fields.getTextInputValue('image_input');
          break;
        case 'thumbnail_modal':
          messageData.thumbnail = modal.fields.getTextInputValue('thumbnail_input');
          break;
        default:
          return;
      }

      await updatePreview(modal);
    });

    collector.on('end', () => {
      interaction.editReply({
        content: 'Message editor timed out.',
        components: [],
        embeds: []
      }).catch(() => {});
    });
  }
});