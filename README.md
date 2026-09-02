# QRSpell

QRSpell is a macOS menu bar app for scanning on-screen QR codes, creating QR codes, and keeping scan history.

- Website: https://qrspell.app/
- Mac App Store: https://apps.apple.com/app/id6771453521
- Help Center: https://qrspell.app/helpcenter/

## Website information update checklist

When app features, pricing, system requirements, privacy or network behavior, or the released version change, review the visible pages and their machine-readable metadata together. Updating only the text shown on the page is not complete.

- Confirm app facts against the released app and its App Store listing. Keep `softwareVersion` on the released version; label any deliberately mentioned upcoming feature with its version.
- Review the affected homepage, Help Center, and Privacy Policy copy. Update Changelog entries only for an approved release update, and preserve historical release information.
- For each affected HTML page, review `<title>`, the meta description, and Open Graph/Twitter titles and descriptions. Keep them concise and consistent with that page's content.
- In `index.html`, review both JSON-LD objects (`WebSite` and `SoftwareApplication`): descriptions, category, `softwareVersion`, `operatingSystem`, `processorRequirements`, `isAccessibleForFree`, and `offers` price and URL. Optional support purchases do not make the app itself paid.
- For domain or route changes, update canonical links, Open Graph/Twitter URLs and images, JSON-LD IDs and URLs, navigation, `sitemap.xml`, `robots.txt`, and `CNAME` together. Review the expected domain and routes in `scripts/validate-static-site.mjs` too.
- Update `sitemap.xml` last-modified dates for pages that actually changed. Keep this README's app description and links aligned with the website.

Before committing:

```sh
git diff --check
node --check site.js
node --check scripts/validate-static-site.mjs
node scripts/validate-static-site.mjs
```

The static validator checks routes, local assets, canonical URLs, the legacy domain, and the sitemap. It does not verify app facts or fully validate JSON-LD. Also parse and review the JSON-LD, compare it with the visible version, price, and system requirements, and check affected pages in the local preview. When only metadata changes, confirm that the page body and Changelog entries remain unchanged.

After deployment, check the metadata served by `https://qrspell.app/`, not just the local preview. Use Google's [Rich Results Test](https://search.google.com/test/rich-results) if checking rich-result eligibility; passing the local checks is not proof of indexing or search appearance.
