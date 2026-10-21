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
import {localRPCheck} from '../role-utils';
import {PurgeDatabaseChannelEntity} from '../entities/purge-database';
import {getChannel, respond} from '../command-context';
import {integerOption, slashInfo} from '../slash-options';

/// Purges the bot's messages.
export default class PurgeCommand extends CCBotCommand {
    public constructor(client: CCBot) {
        const opt: commando.CommandInfo = {
            name: 'purge',
            description: 'Deletes messages from the bot. Defaults to 1 minute.',
            group: 'general',
            memberName: 'purge'
        };
        super(client, opt, slashInfo([
            integerOption('seconds', 'The amount of time in seconds?', false)
        ]));
    }

    public async run(interaction: commando.CommandoInteraction, args: {seconds?: number}): Promise<void> {
        // Get the database
        const database = this.client.entities.getEntity<PurgeDatabaseChannelEntity>(`purge-channel-${interaction.channelId}`);
        if (!database) {
            await respond(interaction, 'The purge database doesn\'t exist.');
            return;
        }
        const seconds: number = args.seconds ?? 60;
        if (seconds <= 1) {
            await respond(interaction, 'Too short to be practical.');
            return;
        }

        if (!localRPCheck(interaction, ['ViewChannel', 'ManageMessages'], 'purgers')) {
            await respond(interaction, 'You aren\'t authorized to do that.\nYou need READ\\_MESSAGES & MANAGE\\_MESSAGES, or you need to be in the `purgers` role group.');
            return;
        }

        const channel = await getChannel(interaction);
        if (channel.isDMBased()) {
            await respond(interaction, 'That can\'t be done here. (DM channel?)');
            return;
        }
        if (!('bulkDelete' in channel)) {
            await respond(interaction, 'That can\'t be done here.');
            return;
        }
        // Nuke it. I hope you intended this...
        const collated: string[] = [];
        const targetTimestamp = Date.now() - (seconds * 1000);
        for (let i = database.messages.length - 1; i >= 0; i--) {
            const msgID = database.messages[i];
            if (discord.SnowflakeUtil.deconstruct(msgID).timestamp >= targetTimestamp) {
                this.client.entities.killEntity(`message-${msgID}`, true);
                collated.push(msgID);
                if (collated.length >= 200)
                    break;
            } else {
                break;
            }
        }
        await channel.bulkDelete(collated);
        await respond(interaction, `Purged ${collated.length} message(s).`);
    }
}
