# Axen Mentorship Hub

A polished, local-first web app for tracking Axen Xcelerate University mentees.

## Features
- Dashboard with mentee cards, scores, and status
- Full Check-In form matching the official mentor toolkit
- Mentee detail view with check-in history
- Escalation flagging
- Local persistence (localStorage)
- Export data as JSON

## Run locally
Open `index.html` in a browser, or serve the folder:

```bash
cd mentorship-app
python3 -m http.server 8000
# or
npx serve .
```

Then visit http://localhost:8000

## Data
All data lives in the browser’s localStorage under the key `axen-mentorship-v1`.  
Use the Export button to download a backup.

## Making it live
This is a static site. You can deploy it in minutes:

1. **Netlify Drop** — drag the `mentorship-app` folder onto https://app.netlify.com/drop
2. **Vercel** — `npx vercel` from the folder
3. **Cloudflare Pages** or **GitHub Pages**

Then buy a domain (Cloudflare Registrar, Namecheap, Google Domains, etc.) and point it at your deployment.

## Next improvements
- Full Escalation & Graduation forms
- Graduation readiness checklist
- Search / filter
- Multi-mentor support
- Optional backend sync
