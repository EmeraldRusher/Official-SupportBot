// SupportBot | Emerald Services
// Ready Event

const fs = require("fs");

const Discord = require("discord.js");
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const client = new Discord.Client({intents: 32767})

const yaml = require("js-yaml");

const supportbot = yaml.load(
  fs.readFileSync("./Configs/supportbot.yml", "utf8")
);
const panelconfig = yaml.load(
  fs.readFileSync("./Configs/ticket-panel.yml", "utf8")
);

const cmdconfig = yaml.load(
  fs.readFileSync("./Configs/commands.yml", "utf8")
);

const msgconfig = yaml.load(
  fs.readFileSync("./Configs/messages.yml", "utf8")
);

const Event = require("../Structures/Event.js");

let chan1 = client.channels.cache.get(supportbot.Ticket.TicketHome);

module.exports = new Event("ready", async (client, interaction) => {
  const { getRole, getChannel, getCategory } = client;

  if (supportbot.Activity.Type === "Playing", "playing") {
    client.user.setPresence({
      activities: [{ name: supportbot.Activity.Status, type: Discord.ActivityType.Playing }],
      status: supportbot.Activity.Type,
    });
  }

  if (supportbot.Activity.Type === "Watching", "watching") {
    client.user.setPresence({
      activities: [{ name: supportbot.Activity.Status, type: Discord.ActivityType.Watching }],
      status: supportbot.Activity.Type,
    });
  }
  
  if (supportbot.Activity.Type === "Listening", "listening") {
    client.user.setPresence({
      activities: [{ name: supportbot.Activity.Status, type: Discord.ActivityType.Listening }],
      status: supportbot.Activity.Type,
    });
  }

  if (supportbot.Activity.Type === "Competing", "competing") {
    client.user.setPresence({
      activities: [{ name: supportbot.Activity.Status, type: Discord.ActivityType.Competing }],
      status: supportbot.Activity.Type,
    });
  }

  console.log(`\u001b[33m`, `――――――――――――――――――――――――――――――――――――――――――――`);
  console.log(`    `);
  console.log(`\u001b[31m`, `┏━━━┓╋╋╋╋╋╋╋╋╋╋╋╋╋┏┓┏━━┓╋╋╋┏┓`);
  console.log(`\u001b[31m`, `┃┏━┓┃╋╋╋╋╋╋╋╋╋╋╋╋┏┛┗┫┏┓┃╋╋┏┛┗┓`);
  console.log(`\u001b[31m`, `┃┗━━┳┓┏┳━━┳━━┳━━┳┻┓┏┫┗┛┗┳━┻┓┏┛`);
  console.log(`\u001b[31m`, `┗━━┓┃┃┃┃┏┓┃┏┓┃┏┓┃┏┫┃┃┏━┓┃┏┓┃┃`);
  console.log(`\u001b[31m`, `┃┗━┛┃┗┛┃┗┛┃┗┛┃┗┛┃┃┃┗┫┗━┛┃┗┛┃┗┓`);
  console.log(`\u001b[31m`, `┗━━━┻━━┫┏━┫┏━┻━━┻┛┗━┻━━━┻━━┻━┛`);
  console.log(`\u001b[31m`, `┗╋╋╋╋╋╋╋┃┃╋┃┃`);
  console.log(`\u001b[31m`, `╋╋╋╋╋╋╋┗┛╋┗┛`);
  console.log(`    `);
  console.log(`\u001b[33m`, `――――――――――――――――――――――――――――――――――――――――――――`);
  console.log(`    `);  
  console.log(`\u001b[33m`, `${supportbot.General.Name} | [${supportbot.SupportBot_Version}]`, `\u001b[32m`, `Connected to Discord`,);
  console.log("\u001b[32m", "SupportBot created by Emerald Development ");
  console.log(`    `);
  console.log(`\u001b[33m`, `――――――――――――――――― [Links] ――――――――――――――――――`);
  console.log("\u001b[32m", "Discord: https://dsc.gg/emerald-dev");
  console.log("\u001b[32m", "Website: https://emeraldsrv.com");
  console.log("\u001b[32m", "Community: https://community.emeraldsrv.com");
  console.log("\u001b[32m", "Documentation: https://docs.emeraldsrv.com");
  console.log(`    `);
  console.log(`\u001b[33m`, `――――――――――――――――― [Invite] ――――――――――――――――――`);
  console.log("\u001b[32m", `Invite URL: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
  console.log(`    `);
  console.log(`\u001b[33m`, `――――――――――――――――― [Config Check] ――――――――――――――――――`);
  console.log("\u001b[32m", "Config initialization...");

  const roles = [
    supportbot.Roles.StaffMember.Admin,
    supportbot.Roles.StaffMember.Staff
  ];

  if (supportbot.Roles.AutoRole.Role) roles.push(supportbot.Roles.AutoRole.Role);
  
   const channels = [
     supportbot.Suggestions.Channel,
     supportbot.Ticket.Log.TicketLog,
     supportbot.Ticket.Log.TranscriptLog,
     supportbot.Ticket.TicketHome,
     supportbot.Welcome.Channel,
     supportbot.Leave.Channel,
     supportbot.Translate.Log
   ];
  //const categories = [supportbot.TicketCategory];

  if (!channels) {
      console.log("\u001b[31m", `[MISSING CHANNEL]`, `\u001b[37;1m`, `${channels}`, "\u001b[31m", `channel not found. Please check your config file.`);
      return;
  }
//  else {
//      console.log(`\u001b[32m`, `[CHANNEL LOCATED]`, `\u001b[37;1m`, `${channels}`, `\u001b[32;1m`, `channel has been found.`);
//  }

  const missingC = [];
  const missingR = [];
  const missingCat = [];
  
  for (let r of roles) {
    const find = await getRole(r, client.guilds.cache.first());
    if (!find) missingR.push(r);
  }
 // for (let cat of categories) {
 //   const find = await getCategory(cat, client.guilds.cache.first());
 //   if (!find) missingCat.push(cat);
 // }

 const missingRoles = await Promise.all(roles.map(role => getRole(role, client.guilds.cache.first())));
 const missingChannels = await Promise.all(channels.map(channel => getChannel(channel, client.guilds.cache.first())));

 if (missingRoles.some(role => !role)) {
  console.log("\u001b[31m", `Missing roles in your server configuration: ${missingRoles.filter(role => !role).join(', ')}`);
  }

  if (missingChannels.some(channel => !channel)) {
  console.log("\u001b[31m", `Missing channels in your server configuration: ${missingChannels.filter(channel => !channel).join(', ')}`);
  }

  console.log("\u001b[32m", "Configs initialized, No problems were detected.");
  console.log(`    `);

});