import {
  Client,
  Intents,
  Message,
  MessageActionRow,
  MessageButton,
  PartialMessage,
  Snowflake,
} from "discord.js";
import { Database, open } from "sqlite";
import * as sqlite3 from "sqlite3";

const MarkovGen = require("markov-generator");

class Generator {
  private chain: any;

  constructor(corpus: string[]) {
    this.chain = new MarkovGen({
      input: corpus,
      minLength: 10,
    });
  }

  generate(): string {
    const output: string = this.chain.makeChain();
    const outputWithoutLineBreaks = output.replace(/(\r\n|\n|\r)/gm, " ");
    if (outputWithoutLineBreaks.length > 300) {
      const space = outputWithoutLineBreaks.indexOf(" ", 300);
      return outputWithoutLineBreaks.substring(0, space);
    }
    return outputWithoutLineBreaks;
  }
}

const SETUP_SCRIPT = `
    CREATE TABLE IF NOT EXISTS "chains" (
        "event_id"	VARCHAR(48) NOT NULL,
        "chain_id"	VARCHAR(48),
        "content"	TEXT,
        PRIMARY KEY("event_id")
    );
    CREATE INDEX IF NOT EXISTS "user_id" ON "chains" (
        "chain_id"	ASC
    );
`;

interface Chain {
  event_id: string;
  chain_id: string;
  content: string;
}

async function openDatabase(): Promise<Database> {
  const database = await open({
    filename: "chains.sqlite",
    driver: sqlite3.Database,
  });
  await database.run(SETUP_SCRIPT);
  return database;
}

async function insertMessage(database: Database, msg: Message): Promise<void> {
  const chain: Chain = {
    event_id: msg.id,
    chain_id: msg.author.id,
    content: msg.cleanContent,
  };
  await database.run(
    `INSERT INTO chains(event_id, chain_id, content) VALUES (?, ?, ?)`,
    [chain.event_id, chain.chain_id, chain.content]
  );
}

async function deleteMessage(
  database: Database,
  msg: PartialMessage | Message
): Promise<void> {
  await database.run(`DELETE FROM chains WHERE event_id = ?`, [msg.id]);
}

async function generateChain(
  database: Database,
  author: Snowflake
): Promise<Generator> {
  const content = await database.all(
    `SELECT content FROM chains WHERE chain_id = ?`,
    author
  );
  const messages = content.map((c) => c.content);
  return new Generator(messages);
}

async function generateAnyChain(database: Database): Promise<Generator> {
  const content = await database.all(`SELECT content FROM chains`);
  const messages = content.map((c) => c.content);
  return new Generator(messages);
}

if (!process.env.BOT_TOKEN) {
  console.error("Missing config");
  process.exit(1);
}
const token: string = process.env.BOT_TOKEN;

const client = new Client({
  partials: ["MESSAGE", "REACTION"],
  intents:
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS |
    Intents.FLAGS.GUILD_MESSAGES |
    Intents.FLAGS.GUILDS,
});

client.on("ready", () => {
  console.log("Bot is online");
});

openDatabase().then((db) => {
  client.on("messageCreate", async (msg) => {
    if (msg.author && msg.author.bot) {
      console.log("Pero si es un puto bot");
    } else {
      console.log("Registramos un mensaje nuevo");
      await insertMessage(db, msg);
    }
  });
  client.on("messageDelete", async (msg) => {
    if (msg.author && msg.author.bot) {
      console.log("Pero si es un puto bot");
    } else {
      console.log("Eliminamos un mensaje eliminado");
      await deleteMessage(db, msg);
    }
  });
  client.on("interactionCreate", async (i) => {
    if (i.isButton() && i.customId === "compartir") {
      const content = i.message.content;
      await Promise.all([
        i.channel &&
          i.channel.send({
            content: `${content}, generado por <@${i?.member?.user?.id}>`,
            allowedMentions: {
              parse: [],
            },
          }),
        i.update({
          content: "Pues ya estaría :+1:",
          components: [],
        }),
      ]);
    } else if (i.isApplicationCommand() && i.commandName === "markov") {
      await i.deferReply({
        ephemeral: true,
      });
      try {
        const param = i.options.get("persona", false);
        const target = param ? String(param.value) : i.user.id;
        const chain = await generateChain(db, target);
        const markov = chain.generate() + " -- <@" + target + ">";
        const message = await i.editReply({
          content: markov,
          allowedMentions: {
            parse: [],
          },
          components: [
            new MessageActionRow({
              components: [
                new MessageButton({
                  label: "Generar otro",
                  style: "SECONDARY",
                  customId: "otro",
                }),
                new MessageButton({
                  label: "Compartir",
                  style: "PRIMARY",
                  customId: "compartir",
                }),
              ],
            }),
          ],
        });
        if (i.channel) {
          const collector = i.channel.createMessageComponentCollector({
            componentType: "BUTTON",
            filter: (btn) =>
              btn.customId == "otro" && btn.message.id == message.id,
          });
          collector.on("collect", (e) => {
            const markov = chain.generate() + " -- <@" + target + ">";
            e.update({
              content: markov,
              allowedMentions: {
                parse: [],
              },
            });
          });
        }
      } catch (e) {
        const messages = [
          "[El bot te mira con desaprobación]",
          "[El bot se te queda mirando sin decir nada]",
          "[El bot mira tus manos, pero finalmente no dice nada]",
          "[La IA del bot te mira como preguntándose quién eres]",
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        i.followUp(message);
      }
    } else if (i.isApplicationCommand() && i.commandName === "markov-all") {
      await i.deferReply({
        ephemeral: true,
      });
      try {
        const markov = await generateAnyChain(db);
        const message = await i.editReply({
          content: markov.generate(),
          allowedMentions: {
            parse: [],
          },
          components: [
            new MessageActionRow({
              components: [
                new MessageButton({
                  label: "Generar otro",
                  style: "SECONDARY",
                  customId: "otro",
                }),
                new MessageButton({
                  label: "Compartir",
                  style: "PRIMARY",
                  customId: "compartir",
                }),
              ],
            }),
          ],
        });
        if (i.channel) {
          const collector = i.channel.createMessageComponentCollector({
            componentType: "BUTTON",
            filter: (btn) =>
              btn.customId == "otro" && btn.message.id == message.id,
          });
          collector.on("collect", (e) => {
            e.update({
              content: markov.generate(),
              allowedMentions: {
                parse: [],
              },
            });
          });
        }
      } catch (e) {
        const messages = [
          "[El bot te mira con desaprobación]",
          "[El bot se te queda mirando sin decir nada]",
          "[El bot mira tus manos, pero finalmente no dice nada]",
          "[La IA del bot te mira como preguntándose quién eres]",
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        i.followUp(message);
      }
    }
  });
  client.login(token);
});

process.on("SIGINT", () => {
  client.destroy();
});
process.on("SIGTERM", () => {
  client.destroy();
});
