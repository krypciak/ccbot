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

import * as commando from 'discord.js-commando';
import {CCBot, CCBotCommand} from '../ccbot';
import {emoteSafe, randomArrayElement} from '../utils';
import {userAwareGetEmote} from '../entities/user-datablock';
import {getChannel, respond} from '../command-context';
import {integerOption, slashInfo, stringOption} from '../slash-options';

// Scientific reasons for Lea to have to exist.
const tooTinyFailReasons = [
    ' think (or do they?), therefore they are.',
    '-studying scientists advise against a non-existence policy',
    ' want to be free'
];
// Scientific reasons for Lea to avoid being spammed horizontally.
const tooWideFailReasons = [
    '-studying scientists advise against this formation',
    '-studying military scientists want the army to seem less harmful to bait the enemy',
    ' are scared of big rooms'
];
// Scientific reasons for Lea to avoid being spammed vertically.
const tooHighFailReasons = [
    '-studying scientists advise against this formation',
    '-studying military scientists want the army to seem less harmful to bait the enemy',
    '-army requires shorter vertical spaces in order to develop properly as a species',
    ' prefer low ceilings as it reminds them of home'
];

/// Generalized army manufacturing plant for the Lea [NOD]
/// Not to be confused with the other NOD
export default class ArmyCommand extends CCBotCommand {
    public readonly emote: string | undefined;
    public constructor(client: CCBot, group: string, name: string, emote?: string) {
        const options = [
            integerOption('width', 'The breadth of the army? (A number.)'),
            integerOption('height', 'The height of the army? (Defaults to the width.)', false)
        ];
        if (!emote) {
            options.unshift(stringOption('emote', 'The soldiers of the army? (An emote.)'));
        }
        const opt: commando.CommandInfo = {
            name,
            description: `summons ${emote ? `the ${emote}` : 'an'} army`,
            group,
            memberName: name
        };
        super(client, opt, slashInfo(options));
        this.emote = emote;
    }

    public async run(interaction: commando.CommandoInteraction, args: {width: number; height?: number; emote?: string}): Promise<void> {
        // Awkward, but solves the issue.
        let height: number = args.height ?? 0;
        if (height === 0)
            height = args.width;

        const emoteUse = await userAwareGetEmote(this.client, interaction.author, interaction.guild, (this.emote || args.emote)!);
        if (!emoteUse || !emoteSafe(emoteUse, await getChannel(interaction))) {
            await respond(interaction, 'they appear to have been transformed into something unsuitable for this channel');
            return;
        }

        // Initial safety checks
        if ((args.width < 1) || (height < 1)) {
            await respond(interaction, `the ${emoteUse}${randomArrayElement(tooTinyFailReasons)}.`);
            return;
        }
        if (args.width > 20) {
            await respond(interaction, `the ${emoteUse}${randomArrayElement(tooWideFailReasons)}.`);
            return;
        }
        if (height > 10) {
            await respond(interaction, `the ${emoteUse}${randomArrayElement(tooHighFailReasons)}.`);
            return;
        }

        // Build the army
        const lines = [
            '**You are being raided!**'
        ];

        const line = emoteUse.toString().repeat(args.width);
        for (let i = 0; i < height; i++)
            lines.push(line);

        // More safety checks
        const text = lines.join('\n');
        if (text.length > 2000) {
            await respond(interaction, 'the army may be too large!');
            return;
        }

        // Send the army
        await respond(interaction, text);
    }
}
