
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Bookmark, Collection, SortCriteria, SortOrder, AIGeneratedSite } from './types';
import { generateCollectionFromQuery } from './services/geminiService';
import { fetchUrlMetadata } from './services/metadataService';
import { BookmarkIcon, StarIcon, PlusIcon, SortIcon, FilterIcon, GlobeIcon, GearIcon } from './components/Icons';
import AddCollectionModal from './components/AddCollectionModal';
import AddBookmarkModal from './components/AddBookmarkModal';
import EditCollectionModal from './components/EditCollectionModal';
import Spinner from './components/Spinner';

const App: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>(() => {
        try {
            const savedCollections = localStorage.getItem('bookmarkCollections');
            if (savedCollections) {
                // Dates are stored as strings in JSON, so we need to convert them back
                const parsed = JSON.parse(savedCollections);
                return parsed.map((collection: Collection) => ({
                    ...collection,
                    createdAt: new Date(collection.createdAt),
                    bookmarks: collection.bookmarks.map((bookmark: Bookmark) => ({
                        ...bookmark,
                        createdAt: new Date(bookmark.createdAt),
                        lastClickedAt: new Date(bookmark.lastClickedAt),
                    })),
                }));
            }
        } catch (error) {
            console.error("Failed to load collections from localStorage", error);
        }
        return [];
    });
    
    useEffect(() => {
        try {
            localStorage.setItem('bookmarkCollections', JSON.stringify(collections));
        } catch (error) {
            console.error("Failed to save collections to localStorage", error);
        }
    }, [collections]);

    const [inputValue, setInputValue] = useState('');
    const [isAddCollectionModalOpen, setIsAddCollectionModalOpen] = useState(false);
    const [isAddBookmarkModalOpen, setIsAddBookmarkModalOpen] = useState(false);
    const [isEditCollectionModalOpen, setIsEditCollectionModalOpen] = useState(false);
    const [collectionToEditId, setCollectionToEditId] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
    const [bookmarkDataForModal, setBookmarkDataForModal] = useState<{url: string; name: string; description: string; favicon: string;} | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [sortCriteria, setSortCriteria] = useState<SortCriteria>(SortCriteria.Date);
    const [sortOrder, setSortOrder] = useState<SortOrder>(SortOrder.Desc);
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

    const collectionToEdit = useMemo(
        () => collectionToEditId ? collections.find(c => c.id === collectionToEditId) ?? null : null,
        [collections, collectionToEditId]
    );

    const handleAddCollection = (collectionData: Omit<Collection, 'id' | 'createdAt' | 'bookmarks'>) => {
        const newCollection: Collection = {
            ...collectionData,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            bookmarks: [],
        };
        setCollections(prev => [newCollection, ...prev]);
    };
    
    const handleUpdateCollection = (collectionId: string, data: Partial<Omit<Collection, 'id' | 'bookmarks' | 'createdAt'>>) => {
        setCollections(prev => prev.map(c => 
            c.id === collectionId ? { ...c, ...data } : c
        ));
    };

    const handleDeleteCollection = (collectionId: string) => {
        setCollections(prev => prev.filter(c => c.id !== collectionId));
    };

    const handleAddBookmark = (bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'lastClickedAt' | 'clickCount' | 'relevanceScore'>, collectionId: string) => {
        const newBookmark: Bookmark = {
            ...bookmarkData,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            lastClickedAt: new Date(),
            clickCount: 0,
            relevanceScore: 0,
        };

        setCollections(prev =>
            prev.map(c =>
                c.id === collectionId ? { ...c, bookmarks: [...c.bookmarks, newBookmark] } : c
            )
        );
        setInputValue('');
    };
    
    const handleUpdateBookmark = (updatedBookmark: Bookmark, collectionId: string) => {
        setCollections(prev => prev.map(c => {
            if (c.id !== collectionId) return c;
            return {
                ...c,
                bookmarks: c.bookmarks.map(bm => bm.id === updatedBookmark.id ? updatedBookmark : bm)
            };
        }));
    };
    
    const handleDeleteBookmark = (bookmarkId: string, collectionId: string) => {
        setCollections(prev => prev.map(c => {
            if (c.id !== collectionId) return c;
            return {
                ...c,
                bookmarks: c.bookmarks.filter(bm => bm.id !== bookmarkId)
            };
        }));
    };

    const handleUrlSubmit = async () => {
        if (!isValidUrl(inputValue)) {
            alert("Please enter a valid URL (e.g., https://example.com)");
            return;
        }
        setIsFetchingMetadata(true);
        try {
            const metadata = await fetchUrlMetadata(inputValue);
            setBookmarkDataForModal({
                url: inputValue,
                name: metadata.title,
                description: metadata.description,
                favicon: metadata.favicon
            });
            setIsAddBookmarkModalOpen(true);
        } catch (error) {
            console.error("Failed to fetch metadata, opening modal with basic info.", error);
            const urlObject = new URL(inputValue);
            const hostname = urlObject.hostname.replace('www.', '');
            const name = hostname.split('.')[0];
            setBookmarkDataForModal({
                url: inputValue,
                name: name.charAt(0).toUpperCase() + name.slice(1),
                description: '',
                favicon: `https://www.google.com/s2/favicons?domain=${urlObject.hostname}&sz=64`
            });
            setIsAddBookmarkModalOpen(true);
        } finally {
            setIsFetchingMetadata(false);
        }
    };
    
    const isValidUrl = (string: string) => {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;  
        }
    };
    
    const handleAiSubmit = async () => {
        if (!inputValue.trim()) return;
        setIsAiLoading(true);
        setAiError(null);
        try {
            const sites = await generateCollectionFromQuery(inputValue);
            const newBookmarks: Bookmark[] = sites.map((site: AIGeneratedSite): Bookmark => ({
                id: crypto.randomUUID(),
                url: site.url,
                name: site.name,
                description: site.description,
                favicon: `https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=64`,
                isPublic: true,
                color: '#8b5cf6', // Default AI color
                createdAt: new Date(),
                lastClickedAt: new Date(),
                clickCount: 0,
                relevanceScore: 0,
            }));

            const newCollection: Collection = {
                id: crypto.randomUUID(),
                name: `AI: ${inputValue}`,
                description: `AI-generated collection for "${inputValue}"`,
                isPublic: true,
                color: '#8b5cf6',
                createdAt: new Date(),
                bookmarks: newBookmarks,
            };
            setCollections(prev => [newCollection, ...prev]);
            setInputValue('');
        } catch (error: any) {
            setAiError(error.message || "An unknown error occurred.");
        } finally {
            setIsAiLoading(false);
        }
    };
    
    const calculateRelevance = (bookmark: Bookmark): number => {
        const now = new Date().getTime();
        const ageInHours = (now - new Date(bookmark.createdAt).getTime()) / (1000 * 3600);
        const lastClickedHoursAgo = (now - new Date(bookmark.lastClickedAt).getTime()) / (1000 * 3600);
        
        const score = (bookmark.clickCount * 5) - (ageInHours * 0.1) - (lastClickedHoursAgo * 0.05);
        return score;
    };
    
    const sortedCollections = useMemo(() => {
        const collectionsWithSortedBookmarks = collections.map(collection => {
            if (sortCriteria !== SortCriteria.Relevance) {
                return collection;
            }
            const sortedBms = [...collection.bookmarks].sort((a, b) => {
                const scoreA = calculateRelevance(a);
                const scoreB = calculateRelevance(b);
                return sortOrder === SortOrder.Asc ? scoreA - scoreB : scoreB - scoreA;
            });
            return { ...collection, bookmarks: sortedBms };
        });

        return [...collectionsWithSortedBookmarks].sort((a, b) => {
            let comparison = 0;
            switch (sortCriteria) {
                case SortCriteria.AZ:
                    comparison = a.name.localeCompare(b.name);
                    break;
                case SortCriteria.Quantity:
                    comparison = a.bookmarks.length - b.bookmarks.length;
                    break;
                case SortCriteria.Date:
                    comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    break;
                default:
                    return 0; // Relevance is handled on bookmarks, not collections
            }
            return sortOrder === SortOrder.Asc ? comparison : -comparison;
        });
    }, [collections, sortCriteria, sortOrder]);

    const handleSortToggle = useCallback(() => {
        setSortOrder(prev => (prev === SortOrder.Asc ? SortOrder.Desc : SortOrder.Asc));
    }, []);

    const handleFilterChange = (criteria: SortCriteria) => {
        setSortCriteria(criteria);
        setIsFilterMenuOpen(false);
    };

    const handleOpenEditCollectionModal = (collection: Collection) => {
        setCollectionToEditId(collection.id);
        setIsEditCollectionModalOpen(true);
    };

    return (
        <div className="h-screen bg-slate-900 text-white font-sans flex flex-col overflow-hidden">
            {/* Top Fixed Section */}
            <div className="flex-shrink-0 bg-slate-900/60 backdrop-blur-lg z-30 border-b border-slate-700/50">
                 <div className="max-w-7xl mx-auto px-4 md:px-8">
                    <header className="pt-8 mb-4">
                        <h1 className="text-4xl md:text-5xl font-extrabold mb-2 text-center bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-500 to-cyan-500">
                            AI Bookmark Manager
                        </h1>
                        <p className="text-center text-slate-400">Your intelligent corner of the web.</p>
                    </header>

                    <div className="p-2 rounded-xl">
                        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full p-2 shadow-lg">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Paste a URL to favorite, or type a topic for AI..."
                                className="flex-grow bg-transparent focus:outline-none px-4 text-white placeholder-slate-500"
                            />
                            <button onClick={handleUrlSubmit} disabled={isFetchingMetadata || isAiLoading} className="flex-shrink-0 w-10 h-10 bg-cyan-500 hover:bg-cyan-600 rounded-full flex items-center justify-center transition-transform transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isFetchingMetadata ? <Spinner /> : <BookmarkIcon className="w-5 h-5" />}
                            </button>
                            <button onClick={handleAiSubmit} disabled={isAiLoading || isFetchingMetadata} className="flex-shrink-0 w-10 h-10 bg-fuchsia-500 hover:bg-fuchsia-600 rounded-full flex items-center justify-center transition-transform transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed">
                                {isAiLoading ? <Spinner /> : <StarIcon className="w-5 h-5" />}
                            </button>
                        </div>
                        {aiError && <p className="text-red-400 text-sm mt-2 text-center">{aiError}</p>}
                    </div>
                    
                    <div className="flex items-center justify-center gap-4 py-6">
                        <button onClick={() => setIsAddCollectionModalOpen(true)} className="w-12 h-12 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors" title="New Collection">
                            <PlusIcon className="w-6 h-6"/>
                        </button>
                        <button onClick={handleSortToggle} className="w-12 h-12 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors" title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}>
                            <SortIcon className="w-6 h-6"/>
                        </button>
                        <div className="relative">
                            <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)} className="w-12 h-12 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors" title="Filter">
                                <FilterIcon className="w-6 h-6"/>
                            </button>
                            {isFilterMenuOpen && (
                                <div className="absolute top-14 right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-40 py-1">
                                    {Object.values(SortCriteria).map(crit => (
                                        <button
                                            key={crit}
                                            onClick={() => handleFilterChange(crit)}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700 ${sortCriteria === crit ? 'text-fuchsia-400' : ''}`}
                                        >
                                            {crit}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
            </div>

            {/* Bottom Scrollable Section */}
            <div className="flex-1 overflow-y-auto">
                <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
                    {sortedCollections.length > 0 ? (
                        <div className="space-y-8">
                           {sortedCollections.map(collection => (
                                <div key={collection.id} className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden shadow-lg">
                                    <div className="p-4 border-b-4 flex justify-between items-start" style={{borderColor: collection.color}}>
                                        <div>
                                            <h2 className="text-xl font-bold">{collection.name}</h2>
                                            <p className="text-sm text-slate-400">{collection.description}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleOpenEditCollectionModal(collection)} 
                                            className="flex-shrink-0 p-2 -mr-2 -mt-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                                            aria-label={`Settings for ${collection.name}`}
                                        >
                                            <GearIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {collection.bookmarks.map(bm => (
                                            <a key={bm.id} href={bm.url} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-3 bg-slate-700 p-3 rounded-full hover:bg-slate-600 transition-all duration-300 transform hover:-translate-y-1 shadow-md">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-slate-600 flex items-center justify-center">
                                                     {bm.favicon ? <img src={bm.favicon} alt="" className="w-full h-full object-cover rounded-md" /> : <GlobeIcon className="w-5 h-5 text-slate-400"/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold truncate text-white" style={{color: bm.color}}>{bm.name}</p>
                                                    <p className="text-xs text-slate-400 truncate">{bm.url}</p>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                           ))}
                        </div>
                    ) : (
                        <div className="text-center py-20">
                            <h3 className="text-2xl font-semibold text-slate-300">Your space is empty!</h3>
                            <p className="text-slate-500 mt-2">Create a collection with the '+' button, or use the AI ✨ to discover new sites.</p>
                        </div>
                    )}
                </main>
            </div>
            
            <AddCollectionModal 
                isOpen={isAddCollectionModalOpen}
                onClose={() => setIsAddCollectionModalOpen(false)}
                onSave={handleAddCollection}
            />

            <AddBookmarkModal 
                isOpen={isAddBookmarkModalOpen}
                onClose={() => {
                    setIsAddBookmarkModalOpen(false);
                    setBookmarkDataForModal(null);
                }}
                onSave={handleAddBookmark}
                collections={collections}
                bookmarkData={bookmarkDataForModal}
            />

            <EditCollectionModal
                isOpen={isEditCollectionModalOpen}
                onClose={() => {
                    setIsEditCollectionModalOpen(false);
                    setCollectionToEditId(null);
                }}
                collection={collectionToEdit}
                onUpdateCollection={handleUpdateCollection}
                onDeleteCollection={handleDeleteCollection}
                onUpdateBookmark={handleUpdateBookmark}
                onDeleteBookmark={handleDeleteBookmark}
            />
        </div>
    );
};

export default App;
