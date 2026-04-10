/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, useEffect, ErrorInfo, ReactNode } from "react";
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Image as ImageIcon, Sparkles, Loader2, Download, RefreshCw, Key, PlayCircle, X, LogIn, LogOut, Shield, Users, BarChart3, TrendingUp, Search, Plus, Minus } from "lucide-react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, limit, getDocs } from "firebase/firestore";

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  declare props: ErrorBoundaryProps;

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) errorMessage = parsed.error;
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
              <X size={40} />
            </div>
            <h2 className="text-2xl font-bold text-white">Application Error</h2>
            <p className="text-neutral-400">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[#9D88FF] text-white rounded-xl font-bold hover:bg-[#8B74FF] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function BroyaLogo({ size = 24 }: { size?: number }) {
  const [error, setError] = useState(false);
  const logoUrl = "https://lh3.googleusercontent.com/d/18sbufkDifaEidqmhXKhaSwFcG6j_nNyv";

  if (error) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="bg-neutral-900 rounded-xl flex items-center justify-center border border-neutral-800 shadow-inner"
      >
        <div className="text-[#9D88FF] font-black text-xs italic">B</div>
      </div>
    );
  }

  return (
    <img 
      src={logoUrl} 
      alt="Broya Logo" 
      width={size}
      height={size}
      className="object-contain rounded-xl shadow-sm"
      referrerPolicy="no-referrer"
      onLoad={() => console.log("Logo loaded successfully from Google Drive")}
      onError={(e) => {
        console.error("Logo failed to load from Google Drive", e.toString());
        setError(true);
      }}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [showLanding, setShowLanding] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [retryTimer, setRetryTimer] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let interval: any;
    if (retryTimer > 0) {
      interval = setInterval(() => {
        setRetryTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [retryTimer]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [recentGenerations, setRecentGenerations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | ReactNode | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isProMode, setIsProMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("3:4");
  const [resolution, setResolution] = useState("1K");
  const [standardCredits, setStandardCredits] = useState(10);
  const [proCredits, setProCredits] = useState(0);
  const [isKeyMissing, setIsKeyMissing] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if both keys are missing
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "") {
      setIsKeyMissing(true);
    }
  }, []);

  useEffect(() => {
    // Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthReady(true);

      if (firebaseUser) {
        // Sync with Firestore
        const userRef = doc(db, "users", firebaseUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              standardCredits: 10,
              proCredits: firebaseUser.email === "thebharat555@gmail.com" ? 9999 : 0,
              role: firebaseUser.email === "thebharat555@gmail.com" ? "admin" : "user",
              createdAt: serverTimestamp(),
            };
            await setDoc(userRef, newUser);
            setStandardCredits(10);
            setProCredits(newUser.proCredits);
            setIsAdmin(newUser.role === "admin");

            // Increment total users in global stats
            const statsRef = doc(db, "stats", "global");
            await setDoc(statsRef, { totalUsers: increment(1) }, { merge: true });
          } else {
            const data = userDoc.data();
            setStandardCredits(data.standardCredits || 0);
            setProCredits(data.proCredits || 0);
            
            // Always check email as fallback and update Firestore if needed
            const isOwnerEmail = firebaseUser.email === "thebharat555@gmail.com";
            if (isOwnerEmail) {
              if (data.role !== "admin" || data.proCredits < 100) {
                await updateDoc(userRef, { 
                  role: "admin",
                  proCredits: 9999 
                });
                setProCredits(9999);
                setIsAdmin(true);
              } else {
                setIsAdmin(true);
              }
            } else {
              setIsAdmin(data.role === "admin");
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        // Fallback to localStorage for guests
        const savedStd = localStorage.getItem("insta_std_credits");
        const savedPro = localStorage.getItem("insta_pro_credits");
        if (savedStd) setStandardCredits(parseInt(savedStd, 10));
        if (savedPro) setProCredits(parseInt(savedPro, 10));
        setIsAdmin(false);
      }
    });

    const checkApiKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(true);
      }
    };
    checkApiKey();

    return () => unsubscribeAuth();
  }, []);

  // Admin Data Fetching
  useEffect(() => {
    if (!isAdmin) return;

    // Admin Stats Listener
    const unsubscribeStats = onSnapshot(doc(db, "stats", "global"), (doc) => {
      setGlobalStats(doc.data());
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "stats/global");
    });

    // Fetch recent generations
    const fetchRecent = async () => {
      try {
        const q = query(collection(db, "generations"), orderBy("timestamp", "desc"), limit(10));
        const snap = await getDocs(q);
        setRecentGenerations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "generations");
      }
    };
    
    // Fetch users list with real-time updates
    const unsubscribeUsers = onSnapshot(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "users");
    });

    fetchRecent();

    return () => {
      unsubscribeStats();
      unsubscribeUsers();
    };
  }, [isAdmin]);

  const handleLogin = async () => {
    try {
      console.log("Attempting login...");
      await signInWithPopup(auth, googleProvider);
      console.log("Login successful");
    } catch (err: any) {
      console.error("Login failed", err);
      alert("Login failed: " + (err.message || "Unknown error") + "\n\nCommon fix: Make sure 'broyaai.space' is added to 'Authorized domains' in your Firebase Console (Authentication -> Settings).");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowAdminPanel(false);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setIsKeyMissing(false);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
        setGeneratedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImage(reader.result as string);
        setGeneratedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWatchAd = async () => {
    setIsWatchingAd(true);
    setAdTimer(5);
    const interval = setInterval(() => {
      setAdTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const claimCredits = async () => {
    const refillAmount = 5;
    const newCredits = standardCredits + refillAmount;
    setStandardCredits(newCredits);
    
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { standardCredits: increment(refillAmount) });
        
        // Update global stats
        const statsRef = doc(db, "stats", "global");
        await setDoc(statsRef, { totalAdsWatched: increment(1) }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      localStorage.setItem("insta_std_credits", newCredits.toString());
    }
    
    setIsWatchingAd(false);
    alert(`Success! ${refillAmount} Standard Credits have been added to your account for free.`);
  };

  const handleBuyCredits = async () => {
    // Simulate a successful purchase
    const newProCredits = proCredits + 50;
    setProCredits(newProCredits);
    
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { proCredits: increment(50) });
        
        // Update global stats
        const statsRef = doc(db, "stats", "global");
        await setDoc(statsRef, { totalRevenue: increment(5) }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      localStorage.setItem("insta_pro_credits", newProCredits.toString());
    }
    
    alert("Success! 50 Pro Credits have been added to your account.");
  };

  const generatePost = async () => {
    if (!sourceImage) return;

    // Check limits
    if (isProMode) {
      if (proCredits <= 0 && !hasApiKey) {
        setError("You need Pro Credits or your own API Key to use Pro Mode. Buy credits below!");
        return;
      }
    } else {
      if (standardCredits <= 0) {
        setError("You've run out of free credits. Click '+ Get Free' in the header to refill!");
        return;
      }
    }

    setIsGenerating(true);
    setError(null);

    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "") {
        throw new Error("No API key found. Please add a GEMINI_API_KEY to your Secrets panel or select a key using Pro Mode.");
      }

      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const sourceBase64 = sourceImage.split(",")[1];
      const sourceMimeType = sourceImage.split(";")[0].split(":")[1];

      const parts: any[] = [
        {
          inlineData: {
            data: sourceBase64,
            mimeType: sourceMimeType,
          },
        },
      ];

      let prompt = "Create a professional Instagram post for this product. Top view (flat lay) of the product packaging on a vibrant, colourful, and appealing background. Realistic textures, shot with a 50mm lens, high-end product photography style, professional lighting. The final image should be a complete scene, not just the product.";

      if (referenceImage) {
        const refBase64 = referenceImage.split(",")[1];
        const refMimeType = referenceImage.split(";")[0].split(":")[1];
        parts.push({
          inlineData: {
            data: refBase64,
            mimeType: refMimeType,
          },
        });
        prompt = "Create a professional Instagram post for the product in the first image. Use the second image as a STYLE and COMPOSITION reference. The final image should have the same aesthetic, lighting, and background style as the reference image, but featuring the product from the first image. Realistic textures, professional lighting, high-end product photography style.";
      }

      const modelName = isProMode ? "gemini-3.1-flash-image-preview" : "gemini-2.5-flash-image";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [...parts, { text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: isProMode ? (resolution as any) : undefined,
          },
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setGeneratedImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
          foundImage = true;
          
          // Consume credits
          if (isProMode) {
            if (proCredits > 0) {
              const newPro = proCredits - 1;
              setProCredits(newPro);
              if (user) {
                await updateDoc(doc(db, "users", user.uid), { proCredits: increment(-1) });
              } else {
                localStorage.setItem("insta_pro_credits", newPro.toString());
              }
            }
          } else {
            const newStd = standardCredits - 1;
            setStandardCredits(newStd);
            if (user) {
              await updateDoc(doc(db, "users", user.uid), { standardCredits: increment(-1) });
            } else {
              localStorage.setItem("insta_std_credits", newStd.toString());
            }
          }

          // Log generation
          if (user) {
            await addDoc(collection(db, "generations"), {
              userId: user.uid,
              model: modelName,
              timestamp: serverTimestamp(),
              type: isProMode ? "pro" : "standard"
            });
            
            // Update global stats
            await setDoc(doc(db, "stats", "global"), { 
              totalGenerations: increment(1),
              totalUsers: increment(0) // Just ensure doc exists
            }, { merge: true });
          }

          break;
        }
      }

      if (!foundImage) {
        throw new Error("No image was generated. Please try again.");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      const errorMessage = err.message || "";
      
      if (errorMessage.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API Key error. Please re-select your API key.");
      } else if (errorMessage.includes("quota") || errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        setRetryTimer(60);
        setError(
          <div className="space-y-3">
            <p className="font-bold text-red-400">Shared AI limit reached!</p>
            <p className="text-xs">Google limits how many images can be generated per minute across all users.</p>
            
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-neutral-400 mb-2 uppercase font-bold tracking-wider">Solution 1: Bypass Limit</p>
              <button 
                onClick={handleSelectKey}
                className="w-full py-3 bg-white text-black hover:bg-neutral-200 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <Key size={18} />
                USE YOUR OWN KEY (FREE)
              </button>
            </div>

            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-neutral-400 mb-2 uppercase font-bold tracking-wider">Solution 2: Wait</p>
              <button 
                disabled={retryTimer > 0}
                onClick={generatePost}
                className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${retryTimer > 0 ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-[#9D88FF] text-white hover:bg-[#8A75FF]'}`}
              >
                <RefreshCw size={14} className={retryTimer > 0 ? '' : 'animate-spin-slow'} />
                {retryTimer > 0 ? `Retry in ${retryTimer}s` : 'Try Again Now'}
              </button>
            </div>
          </div>
        );
      } else {
        setError(errorMessage || "Failed to generate image. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = "insta-post.png";
    link.click();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-[#9D88FF]/30">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BroyaLogo size={48} />
            <h1 className="text-xl font-bold tracking-tight">Broya</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleSelectKey}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hasApiKey ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20' : 'text-neutral-400 bg-neutral-900 border border-neutral-800 hover:text-white'}`}
              title={hasApiKey ? "Using personal API Key" : "Use personal API Key to bypass shared limits"}
            >
              <Key size={16} />
              {hasApiKey ? 'Key Active' : 'Use Own Key'}
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-neutral-500 uppercase">Credits</span>
                <span className="text-sm font-bold text-white">{standardCredits}</span>
              </div>
              <div className="w-[1px] h-3 bg-neutral-800 mx-1" />
              <button 
                onClick={handleWatchAd}
                className="text-[10px] font-bold text-[#9D88FF] hover:text-white transition-colors"
              >
                + Get Free
              </button>
            </div>

            {isAdmin && (
              <button 
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showAdminPanel ? 'bg-[#9D88FF] text-white' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white'}`}
              >
                <Shield size={16} />
                Admin Panel
              </button>
            )}
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-white">{user.displayName}</p>
                  <p className="text-[10px] text-neutral-500">{user.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-[#9D88FF] text-white rounded-xl text-sm font-bold hover:bg-[#8B74FF] transition-all shadow-lg shadow-[#9D88FF]/20"
              >
                <LogIn size={18} />
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {showAdminPanel && isAdmin ? (
        <AdminDashboard 
          stats={globalStats} 
          generations={recentGenerations} 
          users={allUsers}
          onClose={() => setShowAdminPanel(false)} 
          currentUser={user}
          onRefillCredits={(amount) => setProCredits(prev => prev + amount)}
        />
      ) : showLanding ? (
        <LandingPage onStart={() => setShowLanding(false)} />
      ) : (
        <>
          <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Horizontal Ad Placeholder */}
        <div className="w-full h-52 bg-neutral-900 border border-neutral-800 rounded-2xl mb-8 flex items-center justify-center text-neutral-600 text-sm font-medium overflow-hidden relative">
          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] uppercase tracking-wider">Advertisement</div>
          Horizontal Ad Space (728x200)
        </div>

        <div className="grid lg:grid-cols-[1fr_1fr_160px] gap-8 items-start">
          
          {/* Left Column: Upload & Controls */}
          <section className="space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Transform your product into a masterpiece
              </h2>
              <p className="text-neutral-400 leading-relaxed">
                Upload your product photo and let AI generate a professional, high-converting Instagram post.
              </p>
            </div>

            <div className="space-y-4">
              {isKeyMissing && !isProMode && (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                      <Key size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-red-200 text-sm">Missing API Key</p>
                      <p className="text-xs text-red-400/80 leading-relaxed">
                        The app needs a Gemini API key to function. Please add a secret named <code className="bg-red-500/20 px-1 rounded">GEMINI_API_KEY</code> in the Secrets panel, or toggle **Pro Mode** below to select a key.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-800 rounded-2xl">
                <div className="space-y-0.5">
                  <p className="font-bold text-sm text-white">Pro Mode (3.1 Flash)</p>
                  <p className="text-xs text-neutral-500">High Resolution & Realistic Textures</p>
                </div>
                <button 
                  onClick={() => setIsProMode(!isProMode)}
                  className={`
                    w-12 h-6 rounded-full transition-colors relative
                    ${isProMode ? 'bg-[#9D88FF]' : 'bg-neutral-800'}
                  `}
                >
                  <div className={`
                    absolute top-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${isProMode ? 'left-7' : 'left-1'}
                  `} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Standard Credits</span>
                  <span className="text-lg font-bold text-white">{standardCredits}</span>
                </div>
                <div className="px-4 py-2 bg-[#9D88FF]/10 border border-[#9D88FF]/20 rounded-xl flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-wider text-[#9D88FF] font-bold">Pro Credits</span>
                  <span className="text-lg font-bold text-[#9D88FF]">{proCredits}</span>
                </div>
              </div>

              {!isProMode ? (
                <div className="space-y-3">
                  <button
                    onClick={handleWatchAd}
                    className="w-full py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all text-neutral-300 border-dashed"
                  >
                    <PlayCircle size={18} />
                    Watch Ad for +2 Standard Credits
                  </button>
                  <div className="w-full h-20 bg-neutral-900/50 border border-neutral-800 rounded-xl flex items-center justify-center text-neutral-600 text-[10px] font-medium overflow-hidden relative">
                    <div className="absolute top-1.5 left-1.5 px-1 py-0.5 bg-neutral-800 rounded text-[8px] uppercase tracking-wider">Sponsored</div>
                    Native Ad Space (300x100)
                  </div>
                </div>
              ) : (
                proCredits <= 0 && !hasApiKey && (
                  <button
                    onClick={() => {
                      const pricingEl = document.getElementById('pricing');
                      pricingEl?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full py-3 bg-[#9D88FF]/10 border border-[#9D88FF]/20 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#9D88FF]/20 transition-all text-[#9D88FF]"
                  >
                    <Sparkles size={18} />
                    Buy Pro Credits to Generate
                  </button>
                )
              )}

              {isProMode && !hasApiKey && hasApiKey !== null && (
                <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-3xl space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                      <Key size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-amber-200">API Key Required</p>
                      <p className="text-sm text-amber-400/80 leading-relaxed">
                        To use the high-quality image generation model, you need to select a paid API key. 
                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="ml-1 underline font-medium text-amber-400">Learn about billing</a>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSelectKey}
                    className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/10"
                  >
                    Select API Key
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Source Image Upload */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                    ${sourceImage ? 'border-[#9D88FF] bg-[#9D88FF]/5' : 'border-neutral-800 hover:border-[#9D88FF]/50 hover:bg-neutral-900/50'}
                  `}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {sourceImage ? (
                    <img 
                      src={sourceImage} 
                      alt="Source" 
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500">
                      <div className="w-8 h-8 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
                        <Upload size={14} />
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-medium text-neutral-300">Upload Image</p>
                      </div>
                    </div>
                  )}

                  {sourceImage && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="absolute bottom-2 right-2 bg-neutral-900/90 backdrop-blur shadow-sm border border-neutral-800 px-2 py-1 rounded-full text-[10px] font-medium hover:bg-neutral-800 transition-colors text-white"
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* Reference Image Upload */}
                <div 
                  onClick={() => referenceFileInputRef.current?.click()}
                  className={`
                    relative h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                    ${referenceImage ? 'border-[#9D88FF] bg-[#9D88FF]/5' : 'border-neutral-800 hover:border-[#9D88FF]/50 hover:bg-neutral-900/50'}
                  `}
                >
                  <input 
                    type="file" 
                    ref={referenceFileInputRef}
                    onChange={handleReferenceImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {referenceImage ? (
                    <img 
                      src={referenceImage} 
                      alt="Reference" 
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-500">
                      <div className="w-8 h-8 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
                        <ImageIcon size={14} />
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-medium text-neutral-300">Reference Style</p>
                      </div>
                    </div>
                  )}

                  {referenceImage && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        referenceFileInputRef.current?.click();
                      }}
                      className="absolute bottom-2 right-2 bg-neutral-900/90 backdrop-blur shadow-sm border border-neutral-800 px-2 py-1 rounded-full text-[10px] font-medium hover:bg-neutral-800 transition-colors text-white"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={generatePost}
                disabled={!sourceImage || isGenerating}
                className={`
                  w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all shadow-xl
                  ${!sourceImage || isGenerating 
                    ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed shadow-none border border-neutral-700' 
                    : 'bg-[#9D88FF] text-white hover:bg-[#8B74FF] hover:scale-[1.02] active:scale-[0.98] shadow-[#9D88FF]/20'}
                `}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Generating Magic...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Generate Instagram Post
                  </>
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Aspect Ratio</p>
                <select 
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-transparent border-none text-white font-semibold focus:ring-0 cursor-pointer outline-none"
                >
                  <option value="1:1" className="bg-neutral-900">1:1 Square</option>
                  <option value="3:4" className="bg-neutral-900">3:4 Portrait</option>
                  <option value="4:3" className="bg-neutral-900">4:3 Landscape</option>
                  <option value="9:16" className="bg-neutral-900">9:16 Story</option>
                  <option value="16:9" className="bg-neutral-900">16:9 Cinematic</option>
                  {isProMode && (
                    <>
                      <option value="1:4" className="bg-neutral-900">1:4 Tall</option>
                      <option value="4:1" className="bg-neutral-900">4:1 Wide</option>
                    </>
                  )}
                </select>
              </div>
              <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Resolution</p>
                <select 
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  disabled={!isProMode}
                  className={`w-full bg-transparent border-none text-white font-semibold focus:ring-0 outline-none ${!isProMode ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  {!isProMode && <option value="Standard" className="bg-neutral-900">Standard</option>}
                  <option value="1K" className="bg-neutral-900">1K HD</option>
                  <option value="2K" className="bg-neutral-900">2K Ultra</option>
                  <option value="4K" className="bg-neutral-900">4K Studio</option>
                </select>
              </div>
            </div>
          </section>

          {/* Right Column: Result */}
          <section className="relative">
            <div className="sticky top-32 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                  <ImageIcon size={20} className="text-[#9D88FF]" />
                  Preview
                </h3>
                {generatedImage && (
                  <button 
                    onClick={downloadImage}
                    className="text-[#9D88FF] hover:text-[#8B74FF] text-sm font-semibold flex items-center gap-1"
                  >
                    <Download size={16} />
                    Download
                  </button>
                )}
              </div>

              <div className="aspect-[3/4] max-h-[300px] mx-auto bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden shadow-2xl relative group">
                <AnimatePresence mode="wait">
                  {generatedImage ? (
                    <motion.img
                      key="result"
                      initial={{ opacity: 0, scale: 1.05 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={generatedImage}
                      alt="Generated Post"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 p-12 text-center"
                    >
                      {isGenerating ? (
                        <div className="space-y-4 flex flex-col items-center">
                          <div className="relative">
                            <Loader2 className="animate-spin text-[#9D88FF]" size={48} />
                            <Sparkles className="absolute -top-2 -right-2 text-amber-400 animate-pulse" size={20} />
                          </div>
                          <p className="text-neutral-300 font-medium animate-pulse">Crafting your professional post...</p>
                          <p className="text-sm text-neutral-500">This usually takes about 10-15 seconds</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mx-auto border border-neutral-700">
                            <ImageIcon size={32} />
                          </div>
                          <p className="font-medium text-neutral-300">Your generated post will appear here</p>
                          <p className="text-sm">Upload a product photo and hit generate to see the magic happen.</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {generatedImage && (
                <div className="flex gap-3">
                  <button
                    onClick={generatePost}
                    className="flex-1 py-3 bg-neutral-900 border border-neutral-800 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors text-white"
                  >
                    <RefreshCw size={18} />
                    Regenerate
                  </button>
                  <button
                    onClick={downloadImage}
                    className="flex-1 py-3 bg-[#9D88FF] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#8B74FF] transition-colors shadow-lg shadow-[#9D88FF]/10"
                  >
                    <Download size={18} />
                    Save to Device
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Vertical Ad Placeholder */}
          <aside className="hidden lg:block sticky top-32 w-40 h-[600px] bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center text-neutral-600 text-sm font-medium overflow-hidden relative">
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-neutral-800 rounded text-[10px] uppercase tracking-wider">Advertisement</div>
            <div className="rotate-90 whitespace-nowrap">Vertical Ad Space (160x600)</div>
          </aside>
        </div>
      </main>

      {/* Watch Ad Modal */}
      <AnimatePresence>
        {isWatchingAd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <PlayCircle size={20} className="text-[#9D88FF]" />
                  Watching Advertisement
                </h4>
                {adTimer === 0 && (
                  <button onClick={() => setIsWatchingAd(false)} className="text-neutral-500 hover:text-white">
                    <X size={20} />
                  </button>
                )}
              </div>
              
              <div className="p-12 flex flex-col items-center justify-center space-y-6 text-center">
                <div className="w-full aspect-video bg-neutral-800 rounded-2xl flex items-center justify-center relative overflow-hidden border border-neutral-700">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#9D88FF]/10 to-purple-500/10 animate-pulse" />
                  <PlayCircle size={48} className="text-neutral-700" />
                  <div className="absolute bottom-4 left-4 right-4 h-1 bg-neutral-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 5, ease: "linear" }}
                      className="h-full bg-[#9D88FF]"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-neutral-300 font-medium">
                    {adTimer > 0 ? `Please wait ${adTimer}s to claim credits...` : "Ad finished! You can now claim your credits."}
                  </p>
                  <p className="text-xs text-neutral-500">Watching ads helps keep this service free for everyone.</p>
                </div>

                <button
                  disabled={adTimer > 0}
                  onClick={claimCredits}
                  className={`
                    w-full py-4 rounded-2xl font-bold transition-all
                    ${adTimer > 0 
                      ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed' 
                      : 'bg-[#9D88FF] text-white hover:bg-[#8B74FF] shadow-lg shadow-[#9D88FF]/20'}
                  `}
                >
                  {adTimer > 0 ? `Wait ${adTimer}s` : "Claim +2 Credits"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Pricing Section */}
        <section id="pricing" className="mt-24 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold text-white tracking-tight">Simple, Transparent Pricing</h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">
              Choose the plan that fits your business needs. Upgrade to Pro for studio-quality results.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="p-4 md:p-8 bg-neutral-900 border border-neutral-800 rounded-[2rem] space-y-4 md:space-y-8 flex flex-col">
              <div className="space-y-1">
                <h3 className="text-lg md:text-xl font-bold text-white">Standard</h3>
                <p className="text-[10px] md:text-sm text-neutral-500">Quick social posts</p>
              </div>
              <div className="text-2xl md:text-4xl font-black text-white">$0 <span className="text-[10px] md:text-sm font-normal text-neutral-500">/ forever</span></div>
              <ul className="space-y-2 md:space-y-4 flex-1">
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-neutral-300">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-[#9D88FF]/10 rounded-full flex items-center justify-center text-[#9D88FF] text-[8px] md:text-[10px]">✓</div>
                  Gemini 2.5
                </li>
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-neutral-300">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-[#9D88FF]/10 rounded-full flex items-center justify-center text-[#9D88FF] text-[8px] md:text-[10px]">✓</div>
                  Standard Res
                </li>
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-neutral-300">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-[#9D88FF]/10 rounded-full flex items-center justify-center text-[#9D88FF] text-[8px] md:text-[10px]">✓</div>
                  Ad Supported
                </li>
              </ul>
              <button 
                onClick={handleWatchAd}
                className="w-full py-2 md:py-4 bg-neutral-800 text-white rounded-xl md:rounded-2xl font-bold text-xs md:text-base hover:bg-neutral-700 transition-colors"
              >
                Watch Ad
              </button>
            </div>

            {/* Pro Plan */}
            <div className="p-4 md:p-8 bg-[#9D88FF] rounded-[2rem] space-y-4 md:space-y-8 flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Sparkles size={80} />
              </div>
              <div className="space-y-1 relative z-10">
                <h3 className="text-lg md:text-xl font-bold text-white">Pro Pack</h3>
                <p className="text-[#F0EEFF]/70 text-[10px] md:text-sm">Studio quality</p>
              </div>
              <div className="text-2xl md:text-4xl font-black text-white relative z-10">$5 <span className="text-[10px] md:text-sm font-normal text-[#F0EEFF]/70">/ 50</span></div>
              <ul className="space-y-2 md:space-y-4 flex-1 relative z-10">
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-white">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-white/20 rounded-full flex items-center justify-center text-white text-[8px] md:text-[10px]">✓</div>
                  Gemini 3.1
                </li>
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-white">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-white/20 rounded-full flex items-center justify-center text-white text-[8px] md:text-[10px]">✓</div>
                  4K Studio
                </li>
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-white">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-white/20 rounded-full flex items-center justify-center text-white text-[8px] md:text-[10px]">✓</div>
                  No Ads
                </li>
                <li className="flex items-center gap-2 md:gap-3 text-[10px] md:text-sm text-white">
                  <div className="w-4 h-4 md:w-5 md:h-5 bg-white/20 rounded-full flex items-center justify-center text-white text-[8px] md:text-[10px]">✓</div>
                  Priority
                </li>
              </ul>
              <button 
                onClick={handleBuyCredits}
                className="w-full py-2 md:py-4 bg-white text-[#9D88FF] rounded-xl md:rounded-2xl font-bold text-xs md:text-base hover:bg-[#F0EEFF] transition-colors relative z-10 shadow-xl"
              >
                Buy Pro
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
      <footer className="border-t border-neutral-800 mt-24 py-12 bg-neutral-950">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-4">
          <p className="text-neutral-500 text-sm">
            Powered by Gemini AI Models
          </p>
          <div className="flex justify-center gap-6 text-neutral-800">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        </div>
      </footer>
        </>
      )}
    </div>
  );
}

function AdminDashboard({ stats, generations, users, onClose, currentUser, onRefillCredits }: { stats: any, generations: any[], users: any[], onClose: () => void, currentUser: any, onRefillCredits: (amount: number) => void }) {
  const [activeTab, setActiveTab] = useState<'stats' | 'users'>('stats');
  const [searchTerm, setSearchTerm] = useState('');
  const [giftAmount, setGiftAmount] = useState<number>(10);

  const filteredUsers = users.filter(u => 
    (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    u.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleGiveCredits = async (userId: string, type: 'standard' | 'pro', amount: number) => {
    if (!amount || amount === 0) {
      alert("Please enter a valid amount to gift.");
      return;
    }

    try {
      console.log(`Admin attempting to give ${amount} ${type} credits to ${userId}`);
      const userRef = doc(db, "users", userId);
      
      // Optimistic alert
      const confirmUpdate = window.confirm(`Are you sure you want to add ${amount} ${type} credits to this user?`);
      if (!confirmUpdate) return;

      await updateDoc(userRef, {
        [type === 'standard' ? 'standardCredits' : 'proCredits']: increment(amount)
      });
      
      console.log(`Successfully updated ${type} credits by ${amount} for ${userId}`);
      alert(`Success! Added ${amount} ${type} credits.`);
    } catch (err: any) {
      console.error("Failed to update credits:", err);
      alert(`Error: ${err.message || "Failed to update credits. Check console for details."}`);
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-12">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-neutral-400">Business performance and user activity overview.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button 
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-[#9D88FF] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-[#9D88FF] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              Users List
            </button>
          </div>
          <button onClick={onClose} className="p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
      </div>

      {activeTab === 'stats' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard icon={<Users className="text-blue-500" />} label="Total Users" value={stats?.totalUsers || 0} trend="+12%" />
            <StatCard icon={<ImageIcon className="text-[#9D88FF]" />} label="Total Images" value={stats?.totalGenerations || 0} trend="+45%" />
            <StatCard icon={<PlayCircle className="text-amber-500" />} label="Ads Watched" value={stats?.totalAdsWatched || 0} trend="+28%" />
            <StatCard icon={<TrendingUp className="text-emerald-500" />} label="Total Revenue" value={`$${stats?.totalRevenue || 0}`} trend="+15%" />
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <BarChart3 size={20} className="text-[#9D88FF]" />
                  Recent Generations
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
                      <th className="px-6 py-4">User ID</th>
                      <th className="px-6 py-4">Model</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {generations.map((gen) => (
                      <tr key={gen.id} className="text-sm text-neutral-300 hover:bg-neutral-800/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs">{gen.userId.substring(0, 8)}...</td>
                        <td className="px-6 py-4">{gen.model.split('-')[1]}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${gen.type === 'pro' ? 'bg-[#9D88FF]/20 text-[#9D88FF]' : 'bg-neutral-800 text-neutral-500'}`}>
                            {gen.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-neutral-500">{gen.timestamp?.toDate().toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6">
              <h3 className="font-bold text-white">Revenue Breakdown</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500 font-bold uppercase">Ad Revenue (Est.)</p>
                    <p className="text-xl font-bold text-white">${((stats?.totalAdsWatched || 0) * 0.01).toFixed(2)}</p>
                  </div>
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500 font-bold uppercase">Pro Sales</p>
                    <p className="text-xl font-bold text-white">${stats?.totalRevenue || 0}</p>
                  </div>
                  <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                    <TrendingUp size={20} />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-neutral-800">
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Earnings are calculated based on $0.01 per ad view and $5.00 per Pro Credit pack.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Users size={20} className="text-[#9D88FF]" />
              Registered Users ({filteredUsers.length})
              <span className="text-[10px] font-normal text-neutral-500 ml-2 italic">(Users appear here after their first login)</span>
            </h3>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <button 
                onClick={async () => {
                  if (currentUser) {
                    await updateDoc(doc(db, "users", currentUser.uid), { proCredits: increment(100) });
                    onRefillCredits(100);
                    alert("Added 100 Pro Credits to your account!");
                  }
                }}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors flex items-center gap-2"
              >
                <Sparkles size={16} />
                Refill My Credits
              </button>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
                <input 
                  type="text"
                  placeholder="Search name, email or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Trigger search (already filtered by state, but for UX)
                      console.log("Searching for:", searchTerm);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm focus:outline-none focus:border-[#9D88FF] transition-colors"
                />
              </div>
              <button 
                onClick={() => console.log("Searching for:", searchTerm)}
                className="px-4 py-2 bg-[#9D88FF] text-white rounded-xl text-sm font-bold hover:bg-[#8A75FF] transition-colors flex items-center gap-2"
              >
                <Search size={16} />
                Search
              </button>
            </div>
          </div>
          <div className="px-6 py-3 bg-neutral-800/30 border-b border-neutral-800 flex items-center gap-4">
            <span className="text-xs font-bold text-neutral-500 uppercase">Gift Amount:</span>
            <input 
              type="number" 
              value={giftAmount}
              onChange={(e) => setGiftAmount(parseInt(e.target.value) || 0)}
              className="w-20 px-3 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-[#9D88FF]"
            />
            <p className="text-[10px] text-neutral-500 italic">Set amount here, then click +Std or +Pro below to gift.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-neutral-500 uppercase tracking-wider border-b border-neutral-800">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Credits (Std/Pro)</th>
                  <th className="px-6 py-4">Manage Credits</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="text-sm text-neutral-300 hover:bg-neutral-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{u.displayName || 'Guest'}</td>
                    <td className="px-6 py-4 text-neutral-400">{u.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{u.standardCredits}</span>
                        <span className="text-neutral-600">/</span>
                        <span className="text-[#9D88FF] font-bold">{u.proCredits}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleGiveCredits(u.id, 'standard', giftAmount)}
                          className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
                        >
                          +{giftAmount} Std
                        </button>
                        <button 
                          onClick={() => handleGiveCredits(u.id, 'pro', giftAmount)}
                          className="px-2 py-1 bg-[#9D88FF]/10 text-[#9D88FF] rounded text-[10px] font-bold hover:bg-[#9D88FF]/20 transition-colors border border-[#9D88FF]/20"
                        >
                          +{giftAmount} Pro
                        </button>
                        <button 
                          onClick={() => handleGiveCredits(u.id, 'standard', -giftAmount)}
                          className="p-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors border border-red-500/20"
                          title={`Remove ${giftAmount} Standard`}
                        >
                          <Minus size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-neutral-800 text-neutral-500'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-neutral-500">
                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ icon, label, value, trend }: { icon: ReactNode, label: string, value: string | number, trend: string }) {
  return (
    <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-neutral-950 rounded-xl border border-neutral-800">
          {icon}
        </div>
        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">{trend}</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  const row1 = [
    "https://picsum.photos/seed/perfume/600/800",
    "https://picsum.photos/seed/watch/600/800",
    "https://picsum.photos/seed/shoes/600/800",
    "https://picsum.photos/seed/camera/600/800",
    "https://picsum.photos/seed/skincare/600/800",
  ];
  const row2 = [
    "https://picsum.photos/seed/headphones/600/800",
    "https://picsum.photos/seed/bottle/600/800",
    "https://picsum.photos/seed/jewelry/600/800",
    "https://picsum.photos/seed/gadget/600/800",
    "https://picsum.photos/seed/fashion/600/800",
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-start pt-14 pb-12 overflow-hidden bg-neutral-950 relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#9D88FF]/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="max-w-6xl w-full px-6 text-center space-y-12 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight leading-tight">
            Broya <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#9D88FF] to-purple-400">Your Product, Reimagined.</span>
          </h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Turn simple smartphone photos into high-end studio shots. No expensive gear, no complex lighting—just pure AI magic.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="space-y-2"
        >
          <div className="relative">
            <ScrollingRow images={row1} direction="left" />
            <ScrollingRow images={row2} direction="right" />
            
            {/* Gradient Overlays for smooth edges */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-neutral-950 to-transparent z-10" />
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-neutral-950 to-transparent z-10" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="pt-8"
        >
          <button
            onClick={onStart}
            className="group relative px-12 py-5 rounded-2xl font-black text-xl text-white transition-all overflow-hidden"
          >
            {/* Glass Effect Background */}
            <div className="absolute inset-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl group-hover:bg-white/20 transition-all" />
            
            {/* Inner Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#9D88FF]/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <span className="relative flex items-center gap-3">
              Start Creating
              <Sparkles className="group-hover:rotate-12 transition-transform" />
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}

function ScrollingRow({ images, direction = "left" }: { images: string[], direction?: "left" | "right" }) {
  return (
    <div className="flex overflow-hidden gap-0 py-1">
      <motion.div
        animate={{
          x: direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"],
        }}
        transition={{
          duration: 30,
          ease: "linear",
          repeat: Infinity,
        }}
        className="flex gap-0 min-w-max"
      >
        {[...images, ...images].map((src, i) => (
          <div key={i} className="w-32 h-[160px] flex-shrink-0 rounded-none overflow-hidden border border-neutral-800 shadow-xl group relative">
            <img
              src={src}
              alt="Testimonial"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
              <p className="text-white text-xs font-bold">Generated with AI</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
