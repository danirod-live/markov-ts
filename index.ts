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
): Promise<string> {
  const content = await database.all(
    `SELECT content FROM chains WHERE chain_id = ?`,
    author
  );
  const messages = content.map((c) => c.content);
  return extractChain(messages);
}

function extractChain(corpus: string[]) {
  const chain = new MarkovGen({
    input: corpus,
    minLength: 10,
  });
  const output: string = chain.makeChain();
  const outputWithoutLineBreaks = output.replace(/(\r\n|\n|\r)/gm, " ");
  if (outputWithoutLineBreaks.length > 300) {
    const space = outputWithoutLineBreaks.indexOf(" ", 300);
    return outputWithoutLineBreaks.substring(0, space);
  }
  return outputWithoutLineBreaks;
}

async function generateAnyChain(database: Database): Promise<string> {
  const content = await database.all(`SELECT content FROM chains`);
  const messages = content.map((c) => c.content);
  return extractChain(messages);
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
          content: "Listo :+1:",
          components: [],
        }),
      ]);
    } else if (i.isButton() && i.customId === "otro") {
      const markov = await generateAnyChain(db);
      await i.update({
        content: markov,
      });
    } else if (i.isButton() && i.customId.startsWith("otro")) {
      const target = i.customId.replace("otro:", "");
      const markov = await generateChain(db, target) + " -- <@" + target + ">";
      await i.update({
        content: markov,
        allowedMentions: {
          parse: [],
        }
      });
    } else if (i.isApplicationCommand() && i.commandName === "markov") {
      await i.deferReply({
        ephemeral: true,
      });
      try {
        const param = i.options.get("persona", false);
        const target = param ? String(param.value) : i.user.id;
        console.log(target);
        const markov =
          (await generateChain(db, target)) + " -- <@" + target + ">";
        i.followUp({
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
                  customId: "otro:" + target,
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
        i.followUp({
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
