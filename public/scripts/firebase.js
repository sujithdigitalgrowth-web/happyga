import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBbZUp5QoD7dUeXbiCE0BFqa9aOFo5BVz8',
  authDomain: 'happyga-2256b.firebaseapp.com',
  projectId: 'happyga-2256b',
  storageBucket: 'happyga-2256b.firebasestorage.app',
  messagingSenderId: '814862354847',
  appId: '1:814862354847:web:ef62b29ad72c30067f55aa',
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
