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
import {CCBot, CCBotCommand} from '../ccbot';
import {VM, VMContext, runFormat} from '../formatter';
import {getUserDatablock} from '../entities/user-datablock';
import {getChannel, respond} from '../command-context';
import {slashInfo, stringOption} from '../slash-options';

export interface SayResult {
    error: boolean;
    text: string;
    opts: discord.MessageCreateOptions & { split: false };
}

// External interface for cases where we want a "say-like interface" (say, greeting, ...?)
export async function say(code: string, vmContext: VMContext): Promise<SayResult | null> {
    // VM
    let text: string;
    try {
        text = await runFormat(code, new VM(vmContext));
    } catch (ex) {
        return {
            error: true,
            text: `**Formatting error**: \`${ex}\` (was the code correct?)`,
            opts: { split: false }
        };
    }
    // Message Options [
    const opts: discord.MessageCreateOptions & { split: false } = { split: false };
    let hasMeta = false;
    if (vmContext.embed) {
        opts.embeds = [vmContext.embed];
        hasMeta = true;
    }
    // ]
    if ((text != '') || hasMeta)
        return {
            error: false,
            text,
            opts
        };
    return null;
}

/// For ventriloquism.
export default class SayCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'say',
            description: 'Has the bot say something. Please see the format syntax guide.',
            group: 'general',
            memberName: 'say',
            throttling: {
                usages: 5,
                duration: 60
            }
        };
        super(client, opt, slashInfo([
            stringOption('text', 'The text to say.')
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {text: string}): Promise<void> {
        // Bootstrap?
        const {bootstrap} = (await getUserDatablock(this.client, interaction.author)).get();
        if (bootstrap && (typeof bootstrap === 'string'))
            args.text = bootstrap + args.text;
        const sayResult = await say(args.text, {
            client: this.client,
            channel: await getChannel(interaction),
            cause: interaction.author,
            writer: interaction.author,
            protectedContent: false,
            args: []
        });
        if (sayResult) {
            // It's important that this *does not* use global in place of the setting in the guild if none exists.
            // By per-guild default say should always have a header.
            const headerless = sayResult.error || this.client.provider?.get(interaction.guild || 'global', 'headerless-say', false);
            const embedOptions = sayResult.opts.embeds ? {embeds: sayResult.opts.embeds} : {};
            if (!headerless) {
                await respond(interaction, `*${interaction.author.toString()} says:*\n${sayResult.text}`, embedOptions);
                return;
            }
            await respond(interaction, sayResult.text, embedOptions);
            return;
        }
        await respond(interaction, 'Nothing to say.');
    }
}
