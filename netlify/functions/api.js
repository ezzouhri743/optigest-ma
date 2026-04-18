// netlify/functions/api.js
// OptiGest — API backend connectée à Neon DB

import { neon } from '@neondatabase/serverless';

const sql = () => neon(process.env.DATABASE_URL);

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const db = sql();
  const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '') || '/';
  const method = event.httpMethod;

  try {

    // ==================== GET /load — charge toutes les données ====================
    if (method === 'GET' && path === '/load') {
      const [products, customers, suppliers, movements, payments, supplier_payments, natures] = await Promise.all([
        db`SELECT id, ref, nature, sphere::float, cylinder::float, stock_init as "stockInit", stock_min as "stockMin", pa::float, pv::float FROM products ORDER BY id`,
        db`SELECT id, name, city, tel, email, remise::float FROM customers ORDER BY id`,
        db`SELECT id, name, city, tel, email FROM suppliers ORDER BY id`,
        db`SELECT id, type, doc_num as "docNum", date::text, customer_id as "customerId", supplier_id as "supplierId", invoice_ref as "invoiceRef", ref, sphere::float, cylinder::float, qty, pa::float, pv::float, discount::float FROM movements ORDER BY id`,
        db`SELECT id, customer_id as "customerId", date::text, amount::float, ref, note FROM payments ORDER BY id`,
        db`SELECT id, supplier_id as "supplierId", date::text, amount::float, ref, note FROM supplier_payments ORDER BY id`,
        db`SELECT ref_nature, libelle, groupe FROM natures ORDER BY ref_nature`
      ]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ products, customers, suppliers, movements, payments, supplier_payments, natures })
      };
    }

    // ==================== POST /movement — ajouter un mouvement ====================
    if (method === 'POST' && path === '/movement') {
      const m = JSON.parse(event.body);
      const result = await db`
        INSERT INTO movements (id, type, doc_num, date, customer_id, supplier_id, invoice_ref, ref, sphere, cylinder, qty, pa, pv, discount)
        VALUES (${m.id}, ${m.type}, ${m.docNum}, ${m.date}, ${m.customerId||null}, ${m.supplierId||null}, ${m.invoiceRef||null}, ${m.ref}, ${m.sphere}, ${m.cylinder}, ${m.qty}, ${m.pa||0}, ${m.pv||0}, ${m.discount||0})
        ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, doc_num=EXCLUDED.doc_num, date=EXCLUDED.date,
          customer_id=EXCLUDED.customer_id, supplier_id=EXCLUDED.supplier_id, invoice_ref=EXCLUDED.invoice_ref,
          ref=EXCLUDED.ref, sphere=EXCLUDED.sphere, cylinder=EXCLUDED.cylinder, qty=EXCLUDED.qty,
          pa=EXCLUDED.pa, pv=EXCLUDED.pv, discount=EXCLUDED.discount
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== DELETE /movement/:id ====================
    if (method === 'POST' && path === '/movement/delete') {
      const { id } = JSON.parse(event.body);
      await db`DELETE FROM movements WHERE id = ${id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ==================== POST /customer — ajouter/maj client ====================
    if (method === 'POST' && path === '/customer') {
      const c = JSON.parse(event.body);
      const result = await db`
        INSERT INTO customers (id, name, city, tel, email, remise)
        VALUES (${c.id}, ${c.name}, ${c.city||''}, ${c.tel||''}, ${c.email||''}, ${c.remise||50})
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, city=EXCLUDED.city, tel=EXCLUDED.tel, email=EXCLUDED.email, remise=EXCLUDED.remise
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== POST /supplier — ajouter/maj fournisseur ====================
    if (method === 'POST' && path === '/supplier') {
      const s = JSON.parse(event.body);
      const result = await db`
        INSERT INTO suppliers (id, name, city, tel, email)
        VALUES (${s.id}, ${s.name}, ${s.city||''}, ${s.tel||''}, ${s.email||''})
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, city=EXCLUDED.city, tel=EXCLUDED.tel, email=EXCLUDED.email
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== POST /product — ajouter/maj produit ====================
    if (method === 'POST' && path === '/product') {
      const p = JSON.parse(event.body);
      const result = await db`
        INSERT INTO products (id, ref, nature, sphere, cylinder, stock_init, stock_min, pa, pv)
        VALUES (${p.id}, ${p.ref}, ${p.nature||p.ref}, ${p.sphere}, ${p.cylinder}, ${p.stockInit||0}, ${p.stockMin||5}, ${p.pa||0}, ${p.pv||0})
        ON CONFLICT (id) DO UPDATE SET ref=EXCLUDED.ref, nature=EXCLUDED.nature, sphere=EXCLUDED.sphere,
          cylinder=EXCLUDED.cylinder, stock_init=EXCLUDED.stock_init, stock_min=EXCLUDED.stock_min,
          pa=EXCLUDED.pa, pv=EXCLUDED.pv
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== POST /products/batch — import en masse ====================
    if (method === 'POST' && path === '/products/batch') {
      const { products } = JSON.parse(event.body);
      for (const p of products) {
        await db`
          INSERT INTO products (id, ref, nature, sphere, cylinder, stock_init, stock_min, pa, pv)
          VALUES (${p.id}, ${p.ref}, ${p.nature||p.ref}, ${p.sphere}, ${p.cylinder}, ${p.stockInit||0}, ${p.stockMin||5}, ${p.pa||0}, ${p.pv||0})
          ON CONFLICT (id) DO UPDATE SET ref=EXCLUDED.ref, nature=EXCLUDED.nature, sphere=EXCLUDED.sphere,
            cylinder=EXCLUDED.cylinder, stock_init=EXCLUDED.stock_init, stock_min=EXCLUDED.stock_min,
            pa=EXCLUDED.pa, pv=EXCLUDED.pv
        `;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: products.length }) };
    }

    // ==================== POST /movements/batch — import en masse ====================
    if (method === 'POST' && path === '/movements/batch') {
      const { movements } = JSON.parse(event.body);
      for (const m of movements) {
        await db`
          INSERT INTO movements (id, type, doc_num, date, customer_id, supplier_id, invoice_ref, ref, sphere, cylinder, qty, pa, pv, discount)
          VALUES (${m.id}, ${m.type}, ${m.docNum}, ${m.date}, ${m.customerId||null}, ${m.supplierId||null}, ${m.invoiceRef||null}, ${m.ref}, ${m.sphere}, ${m.cylinder}, ${m.qty}, ${m.pa||0}, ${m.pv||0}, ${m.discount||0})
          ON CONFLICT (id) DO NOTHING
        `;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: movements.length }) };
    }

    // ==================== POST /customers/batch ====================
    if (method === 'POST' && path === '/customers/batch') {
      const { customers } = JSON.parse(event.body);
      for (const c of customers) {
        await db`
          INSERT INTO customers (id, name, city, tel, email, remise)
          VALUES (${c.id}, ${c.name}, ${c.city||''}, ${c.tel||''}, ${c.email||''}, ${c.remise||50})
          ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, city=EXCLUDED.city, tel=EXCLUDED.tel, email=EXCLUDED.email, remise=EXCLUDED.remise
        `;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: customers.length }) };
    }

    // ==================== POST /payment — paiement client ====================
    if (method === 'POST' && path === '/payment') {
      const p = JSON.parse(event.body);
      const result = await db`
        INSERT INTO payments (customer_id, date, amount, ref, note)
        VALUES (${p.customerId}, ${p.date}, ${p.amount}, ${p.ref||null}, ${p.note||null})
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== POST /supplier_payment — paiement fournisseur ====================
    if (method === 'POST' && path === '/supplier_payment') {
      const p = JSON.parse(event.body);
      const result = await db`
        INSERT INTO supplier_payments (supplier_id, date, amount, ref, note)
        VALUES (${p.supplierId}, ${p.date}, ${p.amount}, ${p.ref||null}, ${p.note||null})
        RETURNING id
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result[0].id }) };
    }

    // ==================== POST /nature — ajouter/maj nature ====================
    if (method === 'POST' && path === '/nature') {
      const n = JSON.parse(event.body);
      await db`
        INSERT INTO natures (ref_nature, libelle, groupe)
        VALUES (${n.ref_nature}, ${n.libelle}, ${n.groupe||''})
        ON CONFLICT (ref_nature) DO UPDATE SET libelle=EXCLUDED.libelle, groupe=EXCLUDED.groupe
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ==================== POST /reset — reset toutes les données ====================
    if (method === 'POST' && path === '/reset') {
      await db`DELETE FROM movements`;
      await db`DELETE FROM payments`;
      await db`DELETE FROM supplier_payments`;
      await db`DELETE FROM products`;
      await db`DELETE FROM customers`;
      await db`DELETE FROM suppliers`;
      await db`DELETE FROM natures`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Route non trouvée: ' + path }) };

  } catch (err) {
    console.error('API Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
