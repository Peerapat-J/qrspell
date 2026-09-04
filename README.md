# QRSpell

QRSpell is a macOS menu bar app for scanning on-screen QR codes, creating QR codes, and keeping scan history.

- Website: https://qrspell.app/
- Mac App Store: https://apps.apple.com/app/id6771453521
- Help Center: https://qrspell.app/helpcenter/

## Release screenshots

- [2.1 — files, display order, source folder, and checksums](assets/app-preview/2.1/README.md)
- [Earlier screenshot export notes](assets/app-preview/MANIFEST.md)

For each release, keep the selected originals in a versioned folder and record their source and order. Generate web-sized copies separately; do not overwrite previous release images. Keep the public Changelog wording aligned with App Store Connect.

Prepare release website changes on a branch. Merge to `main` only after Apple approval, coordinated with the app's availability: merging deploys the website.

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
node --test scripts/*.test.mjs
node scripts/validate-static-site.mjs
```

The static validator checks routes, local assets, canonical URLs, the legacy domain, and the sitemap. Content tests check metadata consistency, version/release links, screenshot order and source checksums, and the approved 2.1 release notes. They do not verify live app behavior or fully validate JSON-LD. Still review app facts and affected pages in the local preview. When only metadata changes, confirm that the page body and Changelog entries remain unchanged.

After deployment, check the metadata served by `https://qrspell.app/`, not just the local preview. Use Google's [Rich Results Test](https://search.google.com/test/rich-results) if checking rich-result eligibility; passing the local checks is not proof of indexing or search appearance.

For search visibility, check URL Inspection and the sitemap in Google Search Console after deployment. Use search impressions, clicks, and App Store traffic to decide which real usage questions need better help content. There is no guarantee of indexing or AI recommendations, and no need to add hidden keywords, invented ratings, or special AI files for Google Search; see [Google's guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
