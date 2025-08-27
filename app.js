// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, orderBy, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/*** Pega aquí TU config real de Firebase ***/
const firebaseConfig = {
  apiKey: "AIzaSyAOefHrY1lzXYkWwq4v9mRp-4n4RmOEDZg",
  authDomain: "duego-b4d0b.firebaseapp.com",
  projectId: "duego-b4d0b",
  storageBucket: "duego-b4d0b.firebasestorage.app",
  messagingSenderId: "742122305440",
  appId: "1:742122305440:web:615be4b7e1ea0634b516c5",
  measurementId: "G-W93KBMPFJC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ------ Selectores ------
const dlg = document.getElementById('publishDialog');
const form = document.getElementById('publishForm');
const cancelBtn = document.getElementById('cancelPublish');
const msg = document.getElementById('publishMsg');
const productGrid = document.getElementById('productGrid');

const openPublishBtns = document.querySelectorAll('[data-action="open-publish"]');
const signinBtn = document.querySelector('[data-action="signin"]');
const signoutBtn = document.querySelector('[data-action="signout"]');
const categoryBtns = document.querySelectorAll('[data-category]');

let currentCategory = "Todo";
let unsubscribeFeed = null;

// ------ Auth ------
function requireAuthOrOpen() {
  if (!auth.currentUser) {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }
  return Promise.resolve();
}

openPublishBtns.forEach(btn => btn.addEventListener('click', async (e) => {
  e.preventDefault();
  await requireAuthOrOpen();
  if (dlg) dlg.showModal();
}));

if (signinBtn) {
  signinBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  });
}
if (signoutBtn) {
  signoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
  });
}

onAuthStateChanged(auth, (user) => {
  if (signinBtn) signinBtn.style.display = user ? 'none' : '';
  if (signoutBtn) signoutBtn.style.display = user ? '' : 'none';
});

// ------ Publicar ------
cancelBtn?.addEventListener('click', () => dlg?.close());

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!msg) return;
  msg.textContent = "Publicando...";
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Inicia sesión para publicar.");

    const fd = new FormData(form);
    const title = fd.get('title').toString().trim();
    const price = Number(fd.get('price'));
    const category = fd.get('category').toString();
    const description = (fd.get('description')||'').toString();
    const whatsapp = fd.get('whatsapp').toString();
    const files = Array.from(fd.getAll('images')).flat().filter(f => f && f.size);

    if (!files.length) throw new Error("Sube al menos una imagen.");

    const urls = [];
    for (const file of files) {
      const path = `listings/${user.uid}/${Date.now()}_${file.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      urls.push(url);
    }

    await addDoc(collection(db, 'listings'), {
      title, price, category, description,
      images: urls,
      ownerUid: user.uid,
      ownerWhatsApp: whatsapp,
      status: 'active',
      createdAt: serverTimestamp()
    });

    msg.textContent = "¡Listo! Publicado.";
    form.reset();
    setTimeout(() => dlg?.close(), 600);
  } catch (err) {
    console.error(err);
    msg.textContent = "Error: " + err.message;
  }
});

// ------ Feed + Filtros ------
categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentCategory = btn.dataset.category || "Todo";
    startFeed(currentCategory);
  });
});

startFeed(currentCategory);

function startFeed(category) {
  if (unsubscribeFeed) unsubscribeFeed();
  let q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'));
  if (category && category !== "Todo") {
    q = query(collection(db, 'listings'),
      where('category', '==', category),
      orderBy('createdAt', 'desc'));
  }
  unsubscribeFeed = onSnapshot(q, (snap) => {
    renderProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderProducts(items) {
  if (!productGrid) return;
  productGrid.innerHTML = "";
  items.forEach(item => {
    const card = document.createElement('article');
    card.className = "product-card";
    card.innerHTML = `
      <div class="img"><img src="${(item.images && item.images[0]) || ''}" alt="${escapeHtml(item.title)}"></div>
      <div class="body">
        <h4>${escapeHtml(item.title)}</h4>
        <p>$${Number(item.price).toLocaleString('es-MX')}</p>
        <button data-buy="${item.id}">Contactar</button>
      </div>
    `;
    productGrid.appendChild(card);
  });

  productGrid.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = items.find(x => x.id === btn.dataset.buy);
      const phone = (it.ownerWhatsApp || '').replace(/[^0-9]/g, '');
      const text = encodeURIComponent(`Hola, me interesa "${it.title}" que vi en Duego MX.`);
      if (phone) {
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
      } else {
        alert("El vendedor no agregó WhatsApp.");
      }
    });
  });
}

function escapeHtml(s){ return s?.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])) }
