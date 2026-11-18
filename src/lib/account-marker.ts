/**
 * The front page is the same cached page for everyone, so it cannot know who
 * is looking. Whether this visitor has an account is therefore remembered in
 * their own browser: once a sign-in is seen here, a small marker is kept, and
 * the page shows "Crafter sign-in" instead of "Become a Crafter".
 *
 * It only chooses a label. Nothing is granted by it.
 */
export const ACCOUNT_MARKER = "missile-mafia:has-account";

/**
 * Runs before the page is painted, so the right label is there from the start.
 * A sign-in leaves a cookie whose name ends in "-auth-token"; seeing it sets the
 * marker, which then outlives signing out.
 */
export const ACCOUNT_MARKER_SCRIPT = `try{var k=${JSON.stringify(ACCOUNT_MARKER)};if(document.cookie.indexOf("-auth-token")!==-1)localStorage.setItem(k,"1");if(localStorage.getItem(k))document.documentElement.dataset.account="1"}catch(e){}`;
