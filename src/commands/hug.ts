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
import {emoteSafe, findMemberByRef} from '../utils';
import {userAwareGetEmote} from '../entities/user-datablock';
import {argList, getChannel, respond} from '../command-context';
import {slashInfo, stringOption} from '../slash-options';

/// For hugging.
export default class HugCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'hug',
            description: 'Hugs another user, or a set of users. End the list with a number to hug that many times.',
            group: 'general',
            memberName: 'hug'
        };
        super(client, opt, slashInfo([
            stringOption('people', 'Who to hug (and, optionally, how many times)?')
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {people: string}): Promise<void> {
        /*
         * Design contributions by:
         *  Emileyah: 208763015657553921
         *  Monika!: 394808963356688394
         *  Kumatsun: 306499531665833984
         */
        const people: string[] = argList(args.people);
        if (people.length == 0) {
            await respond(interaction, 'Who should I hug?');
            return;
        }
        let effectiveLength = people.length;
        let tryTimes = parseInt(people[people.length - 1], 10);
        if ((!Number.isNaN(tryTimes)) && (tryTimes < 50)) {
            effectiveLength--;
        } else {
            tryTimes = 1;
        }
        if (tryTimes < 1) {
            await respond(interaction, 'The space-hugs continuum would be warped!');
            return;
        }
        if (effectiveLength > 10) {
            await respond(interaction, 'The physics of that are questionable, sadly...');
            return;
        }
        const lines = [];
        const hugEmote = await userAwareGetEmote(this.client, interaction.author, interaction.guild, 'shizuHUG');
        if (!hugEmote || !emoteSafe(hugEmote, await getChannel(interaction))) {
            await respond(interaction, 'A configuration issue has made shizuHUG an NSFW emote, and this isn\'t an NSFW channel.');
            return;
        }
        const hugEmoteString = hugEmote.toString().repeat(tryTimes);
        const alreadyHugged: Set<discord.User> = new Set();
        for (let i = 0; i < effectiveLength; i++) {
            const member = findMemberByRef(interaction.guild, people[i]);
            if (member) {
                if (alreadyHugged.has(member.user))
                    continue;
                if (member.user == interaction.author) {
                    lines.push(`You shouldn't have to hug yourself, but ${this.client.user} will hug you! ${hugEmote}`);
                } else {
                    lines.push(`${hugEmoteString} ${member.user.toString()}`);
                }
                alreadyHugged.add(member.user);
            } else {
                lines.push(`Couldn't find ${people[i]}!`);
            }
        }

        const text = lines.join('\n');
        if (text.length > 2000) {
            await respond(interaction, 'Hug overload!');
            return;
        }
        await respond(interaction, text);
    }
}
