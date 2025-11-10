
import React, { useState, useEffect } from 'react';
import { Bookmark, Collection } from '../types';
import Modal from './Modal';

interface AddBookmarkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (bookmarkInfo: Omit<Bookmark, 'id' | 'createdAt' | 'lastClickedAt' | 'clickCount' | 'relevanceScore'>, collectionId: string) => void;
    collections: Collection[];
    url: string;
}

const colors = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef"];


const AddBookmarkModal: React.FC<AddBookmarkModalProps> = ({ isOpen, onClose, onSave, collections, url }) => {
    const [name, setName] = useState('');
    const [favicon, setFavicon] = useState('');
    const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
    const [color, setColor] = useState(colors[5]);
    const [isPublic, setIsPublic] = useState(true);

    useEffect(() => {
        if (isOpen) {
            try {
                const urlObject = new URL(url);
                const fetchedName = urlObject.hostname.replace('www.', '').split('.')[0];
                const capitalizedName = fetchedName.charAt(0).toUpperCase() + fetchedName.slice(1);
                setName(capitalizedName);
                setFavicon(`https://www.google.com/s2/favicons?domain=${urlObject.hostname}&sz=64`);
            } catch (error) {
                setName(url);
                setFavicon('');
            }

            if (collections.length > 0 && !selectedCollectionId) {
                setSelectedCollectionId(collections[0].id);
            }
        }
    }, [isOpen, url, collections, selectedCollectionId]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !selectedCollectionId || !url) return;
        onSave({ name, url, favicon, isPublic, color }, selectedCollectionId);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Favorite">
            <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="flex items-center space-x-4 p-3 bg-slate-700 rounded-lg">
                    {favicon ? (
                        <img src={favicon} alt="favicon" className="w-12 h-12 rounded-md" />
                    ) : (
                        <div className="w-12 h-12 rounded-md bg-slate-600 flex items-center justify-center text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2h10a2 2 0 002-2v-1a2 2 0 012-2h1.945M7.707 4.293l1.414-1.414a1 1 0 011.414 0l1.414 1.414M10 11V6a2 2 0 012-2h0a2 2 0 012 2v5m-4 0h4" /></svg>
                        </div>
                    )}
                    <div className="flex-1">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-transparent text-lg font-semibold text-white focus:outline-none"
                            required
                        />
                        <p className="text-sm text-gray-400 truncate">{url}</p>
                    </div>
                </div>

                <div>
                    <label htmlFor="collection" className="block text-sm font-medium text-gray-300">Collection</label>
                    <select
                        id="collection"
                        value={selectedCollectionId}
                        onChange={(e) => setSelectedCollectionId(e.target.value)}
                        className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    >
                        {collections.length === 0 ? (
                           <option disabled>Please create a collection first</option>
                        ) : (
                           collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                        )}
                    </select>
                </div>
                
                <div>
                     <label className="block text-sm font-medium text-gray-300">Styling Color</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {colors.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`w-8 h-8 rounded-full transition-transform transform ${color === c ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110' : ''}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex items-center">
                    <input
                        id="isPublicBookmark"
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                    />
                    <label htmlFor="isPublicBookmark" className="ml-2 block text-sm text-gray-300">Public Bookmark</label>
                </div>
                <div className="flex justify-end pt-4">
                    <button type="submit" className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Save Favorite
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddBookmarkModal;
