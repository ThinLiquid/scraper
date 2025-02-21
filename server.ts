import express from 'express'
import Fuse from 'fuse.js'
import type { ButtonDB } from './src/types.ts'
import { CustomDB } from './src/custom-db.ts';
import { readFileSync } from 'fs'
import path from 'path';
import { Vibrant } from 'node-vibrant/node';

const getDominantColor = async (imagePath) => {
  const palette = await Vibrant.from(imagePath).getPalette()
  return palette.Vibrant!.hsl
}

const app = express()
const port = 3000

let lastDB: ButtonDB | null = null
const loadData = async (): Promise<ButtonDB> => {
  try {
    const db = new CustomDB('./db.sqlite', true);
    lastDB = await db.getAll()
    db.db.close();
  } finally {
    if (lastDB == null) return { hosts: {}, buttons: {} }
    return lastDB
  }
}

const search = async (db: ButtonDB, q: string) => {
  console.log(Object.values(db.hosts).length)

  const fuse = new Fuse(Object.values(db.hosts).flatMap(x => x),{
    includeScore: true,
    isCaseSensitive: false,
    includeMatches: true,
    threshold: 0.3,
    useExtendedSearch: true,
    keys: ['host', 'metadata.title', 'metadata.keywords', 'metadata.description']
  })

  return fuse.search(q)
}

app.get('/', async (req, res) => {
  const db = await loadData()
  res.send(`
    <h1>88x31 Button Search</h1>
    <form action="./search" method="get">
      <input type="text" name="q" placeholder="Search for buttons" />
      <button type="submit">Search</button>
    </form>
    <b>${Object.values(db.hosts).length}</b> hosts<br/>
    <b>${Object.values(db.buttons).length}</b> buttons</br>
    <a href="./all">View all 88x31 buttons</a> - <a href="./spectrum">View button spectrum</a>
  `)
})

app.get('/assets/:button', async (req, res) => {
  res.send(
    readFileSync('./' + path.normalize('buttons/' + req.params.button))
  )
})

app.get('/spectrum', async (req, res) => {
  const db = await loadData();
  const buttons = (await Promise.all(
    Object.entries(db.buttons).map(async ([hash, button]) => {
      const color = await getDominantColor(`buttons/${hash}`).catch(() => null);
      return color ? { hash, button, color } : null;
    })
  )).filter(Boolean);
  
  // Sort using direct numerical comparison
  buttons.sort((a, b) => {
    const [ar, ag, ab] = a.color;
    const [br, bg, bb] = b.color;
    return ar - br || ag - bg || ab - bb;
  });  

  res.send(`
    <a href="./">Back</a>
    <h1>Button Spectrum</h1>
    ${buttons.map(({ hash, button }) => `
      <a href="${button.hrefs[0] || '#'}">
        <img src="./assets/${hash}" alt="${button.alts[0] || ''}" width="88" height="31" />
      </a>
    `).join('')}
  `);
});

app.get('/all', async (req, res) => {
  const db = await loadData();
  const buttons = Object.entries(db.buttons)

  res.send(`
    <a href="./">Back</a>
    <h1>All Buttons (${buttons.length})</h1>
    ${buttons.map(([ hash, button ]) => `
      <a href="${button.hrefs[0] || '#'}">
        <img src="./assets/${hash}" alt="${button.alts[0] || ''}" width="88" height="31" />
      </a>
    `).join('')}
  `);
});

app.get('/search', async (req, res) => {
  const db = await loadData()

  const q = (req.query.q as string) || '';
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;

  const start = Date.now();
  const results = await search(db, q);
  const end = Date.now();

  const totalResults = results.length;
  const totalPages = Math.ceil(totalResults / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedResults = results.slice(offset, offset + pageSize);

  const resultHTML = paginatedResults.map(({ item, score }) => `
    <div>
      <h3>${item.host} (score: ${score})</h3>
      <details>
        <summary>site metadata</summary>
        <p>${item.metadata.map(x => `
        <strong>${x.title}</strong>
        <br/>
        ${x.description ?? 'no description'}
        <br/>
        ${x.keywords ? x.keywords.join(', ') : ''}
      `).join('<br/>')}</p>
      </details>
      <details>
        <summary>paths</summary>
        <ul>
          ${item.paths.map(x => `<li>${x.join(' > ')}</li>`).join('')}
        </ul>
      </details>
      <h4>Buttons</h4>
      <table>
        <thead>
          <tr>
            <th>hash</th>
            <th>button</th>
            <th>alt</th>
            <th>src</th>
            <th>href</th>
            <th>found at</th>
            <th>timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${item.buttons.map((hash) => {
            const button = db.buttons[hash]

            return `
            <tr>
              <td>${hash}</td>
              <td><a href="${button.hrefs[0] || ''}"><img src="${button.srcs[0]}" alt="${button.alts[0] || ''}" /></a></td>
              <td style="background:${button.alts[0] || '' ? 'transparent' : 'lightgrey'}">${button.alts[0] || ''}</td>
              <td>${button.srcs.join('<br/>')}</td>
              <td style="background:${button.hrefs[0] || '' ? 'transparent' : 'lightgrey'}">${button.hrefs[0] || ''}</td>
              <td>${button.foundAt.join('<br/>')}</td>
              <td>${new Date(button.timestamp).toUTCString()}</td>
            </tr>
          `
          }).join('')}
        </tbody>
      </table>
      <hr/>
    </div>
  `).join('');

  // Build pagination controls
  let paginationHTML = `<div class="pagination">`;
  if (page > 1) {
    paginationHTML += `<a href="./search?q=${encodeURIComponent(q)}&page=${page - 1}&pageSize=${pageSize}">Previous</a>`;
  }
  paginationHTML += ` <span>Page ${page} of ${totalPages}</span> `;
  if (page < totalPages) {
    paginationHTML += `<a href="./search?q=${encodeURIComponent(q)}&page=${page + 1}&pageSize=${pageSize}">Next</a>`;
  }
  paginationHTML += `</div>`;

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>88x31 Button Search</title>
        <style>
          table {
            max-width: 100%;
            border-collapse: collapse;
          }
          table, td, th {
            border: 1px solid #ccc;
            text-align: left;
            padding: 4px;
          }
          img {
            max-width: 88px;
            max-height: 31px;
          }
          body { word-break: break-word; }
          .pagination {
            margin: 20px 0;
            font-size: 16px;
          }
          .pagination a {
            margin: 0 10px;
            text-decoration: none;
            color: blue;
          }
        </style>
      </head>
      <body>
        <a href="./">Back</a>
        <h1>88x31 Button Search</h1>
        <form action="./search" method="get">
          <input type="text" name="q" placeholder="Search for buttons" value="${q}" />
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="pageSize" value="${pageSize}" />
          <button type="submit">Search</button>
        </form>
        <p>Extended search syntax: <a href="https://www.fusejs.io/examples.html#extended-search">https://www.fusejs.io/examples.html#extended-search</a></p>

        <h2>Search results for: ${q}</h2>
        <p>Found ${totalResults} results in ${end - start}ms, total ${Object.values(db.hosts).length}</p>
        ${paginationHTML}
        <div>
          ${resultHTML}
        </div>
      </body>
    </html>
  `);
});

app.get('/raw', async (req, res) => {
  res.send(await loadData())
})

app.listen({
  port,
  host: '0.0.0.0'
}, () => {
  console.log(`Server started at http://localhost:${port}`)
})