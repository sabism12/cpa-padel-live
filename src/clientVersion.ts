/**
 * Lets the server tell the current site apart from copies of it that were
 * loaded before the site could update itself (see appUpdate.ts). Those old
 * copies never check for a new deploy, so the server shows them
 * OUTDATED_CLIENT_NOTICE where they display the tournament name (the big band
 * on the Scores page). Safe to remove once no old copies are left in use.
 */
export const CLIENT_VERSION_HEADER = 'X-CPA-Client';
export const CLIENT_VERSION = '2';
export const OUTDATED_CLIENT_NOTICE = 'New version: close this page and open the link again';
