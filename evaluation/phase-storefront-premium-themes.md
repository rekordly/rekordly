# Premium storefront theme checkpoint

## 19 November 2026

- Added Studio and Market with different home, catalogue and product layouts. Both use the published catalogue, variant data, guest cart and shared order flow.
- Added real storefront captures, separate sample catalogues, and template library links. Store Information supplies branding. Template-specific drafts stay private until an authorised publish.
- Desktop browser checks covered Market suggestions, search results, quick add and full-cart navigation. At 375px, both layouts fit the viewport. Market filters reduced the results and Studio variant changes updated availability and added the available option to the cart.
- The Go API builds. Targeted design integration tests passed in a disposable PostgreSQL database, including draft isolation, independent drafts, ownership enforcement and publishing either premium template. The database was dropped after the run.
- Checkout, payment and shopper tracking work from planning 39 is still in the parallel checkout. The combined flow needs verification after integration. No live purchases were made.

Demo photography was generated with the built-in image tool and packaged as WebP.

1. Studio hero: warm architectural still life with a hand-thrown terracotta vase, woven linen and an olive branch on travertine, in afternoon side light.
2. Studio products: six square catalogue photographs of a terracotta vase, linen throw, stoneware mug, glazed bowl, table runner and serving plate on cream backgrounds.
3. Market hero: graphite headphones and compact wireless speakers against pale blue, with crisp shadows.
4. Market products: six square catalogue photographs of headphones, a mechanical keyboard, a USB-C hub, a speaker, a laptop stand and a braided cable on cool grey backgrounds.
