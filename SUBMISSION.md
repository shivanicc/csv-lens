# NextSpark Hacks — Devpost answers

## Project name
CSV Lens

## Elevator pitch
Drop a CSV, get a dashboard. Column types, stats, charts and a filterable table, all in your browser, nothing uploaded.

## About the project

## Inspiration
Every job I've had involved someone handing me a CSV export and asking "what's in this?". The honest answer was always "give me ten minutes in Excel". And the exports are usually customer data or financials, so uploading them to a random "CSV viewer" website isn't an option. I wanted the thing I'd actually use: open a tab, drop the file, read it, close the tab.

## What it does
CSV Lens parses the file locally in your browser and gives you an overview in about a second: row and column counts, missing-cell rate, and a card per column. It infers types (numbers including currency and percentages, dates in several formats, booleans, text) and shows the right stats for each: min, max, mean, median, sum, standard deviation and a histogram for numbers; range and span for dates; top values with share bars for text. A chart builder lets you group by any text or date column (by day, month or year) and measure count, sum, average, min or max of any numeric column. A table tab sorts by any column with type-aware ordering. One search box filters rows across every column, and both the chart and the table follow it. You can export the filtered rows as a clean CSV. Nothing is ever sent anywhere.

## Who it helps
Anyone who receives data exports and needs a quick, private look: ops and support people, analysts, students with survey results, small business owners with a sales export. It replaces the "open Excel to glance at it" step and makes sharing a quick chart a screenshot away.

## How I built it
Vanilla JavaScript, no framework. The engine (csv.js) is a state-machine CSV parser that handles quoted fields, escaped quotes, newlines inside quotes and BOMs, plus delimiter detection by column-count consistency, type inference on a column sample, statistics with quantiles and histograms, group-by aggregation with date bucketing, and a serializer. It has no DOM dependency so it runs under Node for testing. The UI (app.js) handles loading, filtering, sorting, the overview cards, the chart builder (Chart.js) and the table. Static files, deployed on GitHub Pages.

## Challenges I ran into
CSV is deceptively messy: "1,200.50" inside quotes, line breaks inside a quoted cell, files with semicolons because of European Excel, UTF-8 BOMs. Type inference had to tolerate a few bad values without flipping a whole numeric column to text. And a classic time-zone bug: date-only strings like 2026-01-01 parse as UTC midnight, which bucketed New Year's orders into December in US time zones. Fixed by treating date-only strings as local dates.

## Accomplishments I'm proud of
It works on real exports, not just the sample. The engine is small enough to read in one sitting and is independently testable.

## What I learned
How much of "data tooling" is just careful parsing and sensible defaults, and how far you can get with no framework.

## What's next
Column-specific filters (ranges, date pickers), pivot tables, multiple files side by side, and saving chart configs as shareable links.

## Built with
javascript, html, css, chart.js, github-pages

## Tools and credits
Vanilla HTML/CSS/JS. Chart.js (MIT) for chart rendering. Claude Code used as a pair-programming assistant.

## Repo
https://github.com/shivanicc/csv-lens

## Live demo
https://shivanicc.github.io/csv-lens/

## Demo video script (1 to 3 minutes)
0:00 — Open the live URL, empty drop zone. "This is CSV Lens. You get a CSV export, you want a quick look, and you don't want to upload company data to a random site. This runs entirely in the browser."
0:15 — Click Load sample. "Six hundred orders. Instantly: types, missing values, stats per column." Scroll the cards slowly, point at the histogram on unit_price, the top values on customer_country with the missing warning, the 'looks like an ID' hint on order_id.
0:50 — Chart tab. "Group by order date, by month, sum of units." Change the measure to average of unit_price, change group-by to category, switch to doughnut.
1:20 — Type "Singapore" in the filter. "The chart and the table follow the filter." Open Table tab, click unit_price header to sort, click again to reverse.
1:45 — Click Export filtered CSV. "And you get the filtered rows back out as a clean CSV."
2:00 — Optionally drag a real CSV from your desktop onto the page. "Works with any export: tabs, semicolons, quoted fields, all handled."
2:20 — "Open source, MIT, one static page. Thanks."
