// Copyright (C) 2019-2020 CCDirectLink members
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as discord from 'discord.js';
import * as commando from 'discord.js-commando';
import * as structures from '../data/structures';
import {nsfw} from '../utils';
import {CCBot, CCBotCommand} from '../ccbot';
import {VM, VMContext, runFormat} from '../formatter';
import {userAwareGetEmote} from '../entities/user-datablock';
import {argList, getChannel, respond} from '../command-context';
import {optionsFromArgs, slashInfo} from '../slash-options';

/// Copies an object while also formatting it.
/// Don't ask me how the type conversions are supposed to make sense.
/// They don't.
async function copyAndFormat(vm: VM, embed: unknown): Promise<unknown> {
    if (typeof embed === 'string')
        return await runFormat(embed, vm);
    if (typeof embed === 'object') {
        const o: Record<string, unknown> = {};
        for (const k in embed)
            o[k] = await copyAndFormat(vm, (embed as Record<string, unknown>)[k]);
        return o;
    }
    return embed;
}

/// A JSON-run "command", but really more like a responder.
/// For format details, please see the structures file.
export default class JSONCommand extends CCBotCommand {
    // The JSON command structure.
    private readonly command: structures.Command;

    public constructor(client: CCBot, group: string, name: string, json: structures.Command) {
        const opt: commando.CommandInfo = {
            name,
            description: json.description || 'No description.',
            group: group.toLowerCase(),
            memberName: name.toLowerCase(),
            nsfw: json.nsfw
        };
        // Allows overriding the involved Commando options.
        // This includes adding arguments.
        if (json.options)
            Object.assign(opt, json.options);
        super(client, opt, slashInfo(optionsFromArgs(json.options?.args ?? [])));
        this.command = json;
    }

    public async run(interaction: commando.CommandoInteraction, args: {args?: string}): Promise<void> {
        const channel = await getChannel(interaction);
        if (this.command.nsfw && !nsfw(channel)) {
            await respond(interaction, 'That command is NSFW, and this is not an NSFW channel.');
            return;
        }

        // VM State Init
        const vmContext: VMContext = {
            client: this.client,
            channel,
            cause: interaction.author,
            // JSON commands are always part of the bot (for now)
            writer: interaction.author,
            protectedContent: false,
            args: [],
        };

        // VM Arguments Init
        if (args?.args !== undefined) {
            vmContext.args = argList(args.args);
        }
        for (const arg of vmContext.args)
            if (typeof arg !== 'string') {
                await respond(interaction, 'That command can only eat strings, but it was given non-strings.');
                return;
            }

        // VM Execution
        let formatText;
        {
            const vm = new VM(vmContext);
            // Basic Command
            formatText = await runFormat(this.command.format || '', vm);
            // MO/JSON-supplied Embed
            if (this.command.embed)
                vmContext.embed = await copyAndFormat(vm, this.command.embed) as discord.APIEmbed;
        }

        // Message Options
        const opts: discord.InteractionReplyOptions = {};
        let hasMeta = false;

        // Embed
        if (vmContext.embed) {
            opts.embeds = [vmContext.embed];
            hasMeta = true;
        }

        // Actually send resulting message if necessary
        let response: discord.Message;
        if ((formatText != '') || hasMeta) {
            response = await respond(interaction, formatText, opts);
        } else {
            response = await respond(interaction, 'Nothing to say.');
        }

        // Side-effects
        // Reactions to the message the command was used on.
        // If the command wasn't used as a reply, the bot's own response is used.
        if (this.command.commandReactions) {
            const replied = interaction.options.resolved?.messages?.first();
            let target: discord.Message | null = null;
            if (replied instanceof discord.Message) {
                try {
                    target = await channel.messages.fetch(replied.id);
                } catch (_e) {
                    // The message is gone. Nothing to react to.
                    target = null;
                }
            }
            if (!target)
                target = response;
            for (const react of this.command.commandReactions) {
                const emote = await userAwareGetEmote(this.client, interaction.author, interaction.guild, react);
                if (!emote)
                    continue;
                try {
                    await target.react(emote instanceof discord.GuildEmoji ? emote : emote.name!);
                } catch (_e) {
                    // The reaction could not be added. Nothing to do about it.
                }
            }
        }
    }
}
