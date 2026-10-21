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
import {EntityData} from '../entity-registry';
import {CCBot, CCBotEntity} from '../ccbot';
import {CCBotInteraction, respond} from '../command-context';
import {TextBasedChannel, isChannelTextBased, silence} from '../utils';

const uiFirst = '⏮';
const uiPrev = '◀';
const uiNext = '▶';
const uiLast = '⏭';
const uiClose = '🚫';

/// The prefix of the custom IDs of the page switcher's buttons.
export const pageSwitcherButtonPrefix = 'ccbot-pageswitcher';

/// The actions that the page switcher's buttons can perform.
export type PageSwitcherAction = 'first' | 'prev' | 'next' | 'last' | 'close';

export interface PageSwitcherData extends EntityData {
    // Channel ID.
    channel: string;
    // Message ID (not present if it must be created)
    message?: string;
    // User ID.
    user: string;
    // Page number (0 to pages.length - 1)
    page: number;
    // Pages, cannot be empty
    pages: discord.APIEmbed[];
    // Used if the bot appears to have remove-reaction permission.
    ignoreRemovals?: boolean;
}

function formatHeader(a: number, b: number): string {
    return `Page ${a + 1} of ${b}`;
}

export interface PageSwitcherOutputElementsAdditionalOptions {
    // Additional text on every page.
    // NOTE: This doesn't count as part of elements per page.
    // It does count as part of page length.
    textFooter?: string;
    footer?: {
        text: string;
        icon_url?: string;
    };
}

export interface PageSwitcherOutputElementWithCategory {
    category: string;
    text: string;
}
export type PageSwitcherOutputElement = string | PageSwitcherOutputElementWithCategory;

/// Builds the row of buttons that drives the page switcher.
function buildButtonRow(): discord.ActionRowBuilder<discord.ButtonBuilder> {
    const button = (action: PageSwitcherAction, label: string): discord.ButtonBuilder =>
        new discord.ButtonBuilder()
            .setCustomId(`${pageSwitcherButtonPrefix}:${action}`)
            .setLabel(label)
            .setStyle(discord.ButtonStyle.Secondary);
    return new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
        button('first', uiFirst),
        button('prev', uiPrev),
        button('next', uiNext),
        button('last', uiLast),
        button('close', uiClose)
    );
}

/// Checks whether a custom ID belongs to the page switcher.
export function isPageSwitcherButton(customId: string): boolean {
    return customId.startsWith(`${pageSwitcherButtonPrefix}:`);
}

/// Outputs *either* a page switcher or a single post depending on what's appropriate.
/// Very customizable.
export async function outputElements(client: CCBot, interaction: CCBotInteraction, elements: PageSwitcherOutputElement[], elementsPerPage: number, pageLength: number, options?: PageSwitcherOutputElementsAdditionalOptions): Promise<void> {
    options = options || {};

    const {footer} = options;

    // The text-footer is subtracted from page length, so it's always safe to append.
    const textFooter = options.textFooter || '';
    pageLength -= textFooter.length;

    // Don't send empty embeds.
    if (elements.length === 0) {
        await respond(interaction, 'Nothing found!');
        return;
    }

    // The algorithm begins...
    const pages: Array<discord.APIEmbed & {description: string}> = [];
    let elementsOnPage = 0;
    const finishPage = (): void => {
        pages[pages.length - 1].description += textFooter;
    };
    const newPage = (): void => {
        // Finish last page, if any
        if (pages.length > 0)
            finishPage();
        // Create the new page & set elements to zero
        pages.push({description: ''});
        if (footer)
            pages[pages.length - 1].footer = footer;
        elementsOnPage = 0;
    };
    // Create first page.
    newPage();
    // Category (managed by the loop rather than the paginator stuff because of all the special conditions)
    let currentCategory = '';
    for (const elementRaw of elements) {
        // Convert element
        let elementFull: PageSwitcherOutputElementWithCategory;
        if (typeof elementRaw === 'string') {
            elementFull = {category: '', text: elementRaw};
        } else {
            elementFull = elementRaw;
        }
        let element = elementFull.text;
        let elementPrependedCategory = '';
        // Reset category prepended indicator
        const prependCategoryIfNecessary = (): void => {
            if (currentCategory != elementFull.category) {
                element = `${elementFull.category}\n${elementFull.text}`;
                currentCategory = elementFull.category;
                elementPrependedCategory = elementFull.category;
            }
        };
        if (elementsOnPage == elementsPerPage) {
            newPage();
            currentCategory = elementPrependedCategory;
        }
        prependCategoryIfNecessary();
        // Attempt 1: Move elements to new page
        const nsl = pages[pages.length - 1].description.length + element.length;
        if (nsl >= pageLength) {
            // If there's no elements on the page, making a new page won't work,
            //  so essentially we go straight to attempt 2
            if (elementsOnPage != 0)
                newPage();
            // Either alone on page or, so ensure we prepended category
            currentCategory = elementPrependedCategory;
            prependCategoryIfNecessary();
            // Attempt 2: Split element across pages
            // Category remains the same
            while (element.length >= pageLength) {
                pages[pages.length - 1].description += element.substring(0, pageLength);
                newPage();
                element = element.substring(pageLength);
            }
            // If the element or part of the element starts this page, elementsOnPage is 0,
            //  so we won't get \n prefix (good)
        }
        if (elementsOnPage != 0)
            element = `\n${element}`;
        pages[pages.length - 1].description += element;
        elementsOnPage++;
    }
    // Finish last page
    finishPage();

    // Actual output
    if (pages.length == 1) {
        await respond(interaction, '', {embeds: [new discord.EmbedBuilder(pages[0])]});
        return;
    }
    const output = await respond(interaction, formatHeader(0, pages.length), {
        embeds: [new discord.EmbedBuilder(pages[0])],
        components: [buildButtonRow()]
    });
    await client.entities.newEntity({
        type: 'page-switcher',
        channel: interaction.channelId,
        message: output.id,
        user: interaction.user.id,
        page: 0,
        pages,
        killTimeout: 60000
    });
}

/// Used for a paged interactive UI.
/// Additional fields: See PageSwitcherInit, but:
/// 'channel' is replaced with 'message' after activation.
class PageSwitcherEntity extends CCBotEntity {
    private channel: TextBasedChannel;
    private message: discord.Message;
    private user: string;
    private page: number;
    private pages: discord.APIEmbed[];

    public constructor(c: CCBot, channel: TextBasedChannel, message: discord.Message, data: PageSwitcherData) {
        super(c, `message-${message.id}`, data);
        this.channel = channel;
        this.message = message;
        this.user = data.user;
        this.page = data.page;
        this.pages = data.pages;
    }

    public toSaveData(): PageSwitcherData {
        return Object.assign(super.toSaveData(), {
            channel: this.channel.id,
            message: this.message.id,
            user: this.user,
            page: this.page,
            pages: this.pages
        });
    }

    public onKill(transferOwnership: boolean): void {
        super.onKill(transferOwnership);
        if (!transferOwnership)
            silence(this.message.delete());
    }

    /// Handles a button press on one of the page switcher's buttons.
    public buttonInteractionTouched(interaction: discord.ButtonInteraction): void {
        // Only the person who asked for this menu may use it.
        if (interaction.user.id !== this.user) {
            silence(interaction.reply({
                content: 'This menu belongs to someone else.',
                flags: discord.MessageFlags.Ephemeral
            }));
            return;
        }
        const action = interaction.customId.substring(pageSwitcherButtonPrefix.length + 1) as PageSwitcherAction;
        if (action === 'close') {
            silence(interaction.update({components: []}));
            this.kill(true);
            return;
        }
        // Update display...
        this.updatePage(action);
        silence(interaction.update({
            content: formatHeader(this.page, this.pages.length),
            embeds: [new discord.EmbedBuilder(this.pages[this.page])],
            components: [buildButtonRow()]
        }));
        this.postponeDeathAndUpdate();
    }

    /// Moves the page pointer according to the given action.
    private updatePage(action: PageSwitcherAction): void {
        if (this.pages.length === 0)
            return;
        switch (action) {
            case 'first':
                this.page = 0;
                break;
            case 'prev':
                this.page -= 1;
                break;
            case 'next':
                this.page += 1;
                break;
            case 'last':
                this.page = this.pages.length - 1;
                break;
        }
        // Wrap around in both directions.
        if (this.page < 0)
            this.page = this.pages.length - 1;
        else
            this.page %= this.pages.length;
    }
}

/// Creates a page switcher.
export default async function load(c: CCBot, data: PageSwitcherData): Promise<CCBotEntity> {
    // This makes a possible DM channel with the user 'important enough' to start existing
    // Blame discord.js
    const yesCacheMe = await c.users.fetch(data.user, {cache: true});
    await yesCacheMe.createDM();
    const channel = c.channels.cache.get(data.channel);
    if (!channel || !isChannelTextBased(channel))
        throw new Error('involved channel no longer exists');
    let message: discord.Message;
    if (!data.message) {
        // New
        message = await channel.send({
            content: formatHeader(0, data.pages.length),
            embeds: [new discord.EmbedBuilder(data.pages[0])],
            components: [buildButtonRow()]
        }) as discord.Message;
    } else {
        // Reused
        message = await channel.messages.fetch(data.message);
    }
    return new PageSwitcherEntity(c, channel, message, data);
}
