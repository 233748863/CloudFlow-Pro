export async function scrollPortalContent(locator, label) {
  // Contract and finance refreshes replace the content while a locator is scrolling.
  // Re-resolve only detached elements; layout failures and timeouts must still fail.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 10000 });
      return;
    } catch (error) {
      if (attempt === 3 || !String(error.message).includes('Element is not attached to the DOM')) throw error;
      console.log(`PORTAL_CONTENT_SCROLL_RETRY: label=${label}; attempt=${attempt}; reason=detached_element; timers_unchanged=true`);
    }
  }
}
