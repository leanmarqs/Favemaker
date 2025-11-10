import React, { useState, useEffect, useMemo } from 'react';
import { Collection, Bookmark } from '../types';
import Modal from './Modal';
import EditBookmarkModal from './EditBookmarkModal';
import { PencilIcon, GlobeIcon } from './Icons';

interface EditCollectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    collections: Collection[];
    onUpdateCollection: (collectionId: string, data: Partial<Omit<Collection, 'id' | 'bookmarks' | 'createdAt'>>) => void;
    onDeleteCollection: (collectionId: string) => void;
    onUpdateBookmark: (bookmark: Bookmark, collectionId: string) => void;
    onDeleteBookmark: (bookmarkId: string, collectionId: string) => void;
}

const colors = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef"];

const EditCollectionModal: React.FC<EditCollectionModalProps> = ({ 
    isOpen, onClose, collections, onUpdateCollection, onDeleteCollection, onUpdateBookmark, onDeleteBookmark 
}) => {
    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(colors[0]);
    const [isPublic, setIsPublic] = useState(false);

    const [isEditBookmarkModalOpen, setIsEditBookmarkModalOpen] = useState(false);
    const [bookmarkToEdit, setBookmarkToEdit] = useState<Bookmark | null>(null);
    
    const selectedCollection = useMemo(() => {
        return collections.find(c => c.id === selectedCollectionId) || null;
    }, [selectedCollectionId, collections]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedCollectionId(null);
        } else if (collections.length > 0 && !selectedCollectionId) {
            setSelectedCollectionId(collections[0].id);
        }
    }, [isOpen, collections, selectedCollectionId]);

    useEffect(() => {
        if (selectedCollection) {
            setName(selectedCollection.name);
            setDescription(selectedCollection.description);
            setColor(selectedCollection.color);
            setIsPublic(selectedCollection.isPublic);
        } else {
            setName('');
            setDescription('');
            setColor(colors[0]);
            setIsPublic(false);
        }
    }, [selectedCollection]);

    const handleCollectionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedCollectionId(id === "" ? null : id);
    };

    const handleSaveChanges = () => {
        if (!selectedCollectionId) return;
        onUpdateCollection(selectedCollectionId, { name, description, color, isPublic });
    };

    const handleDeleteCollectionPress = () => {
        if (selectedCollectionId && window.confirm(`Are you sure you want to delete the collection "${selectedCollection?.name}"? This cannot be undone.`)) {
            onDeleteCollection(selectedCollectionId);
            onClose();
        }
    };
    
    const openEditBookmark = (bookmark: Bookmark) => {
        setBookmarkToEdit(bookmark);
        setIsEditBookmarkModalOpen(true);
    };

    const handleUpdateBookmarkSubmit = (updatedBookmark: Bookmark) => {
        if (!selectedCollectionId) return;
        onUpdateBookmark(updatedBookmark, selectedCollectionId);
    };

    const handleDeleteBookmarkSubmit = (bookmarkId: string) => {
        if (!selectedCollectionId) return;
        onDeleteBookmark(bookmarkId, selectedCollectionId);
    };


    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Manage Collections">
                <div className="space-y-6">
                    <div>
                        <label htmlFor="collection-select" className="block text-sm font-medium text-gray-300">Select Collection</label>
                        <select
                            id="collection-select"
                            value={selectedCollectionId ?? ""}
                            onChange={handleCollectionSelect}
                            className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500"
                        >
                            <option value="">-- Choose a collection --</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    {selectedCollection && (
                        <div className="space-y-6 pt-4 border-t border-slate-700 animate-fade-in">
                            {/* Collection Edit Form */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-fuchsia-400">Edit Collection Details</h3>
                                <div>
                                    <label htmlFor="edit-name" className="block text-sm font-medium text-gray-300">Name</label>
                                    <input type="text" id="edit-name" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500" />
                                </div>
                                <div>
                                    <label htmlFor="edit-description" className="block text-sm font-medium text-gray-300">Description</label>
                                    <textarea id="edit-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Color</label>
                                    <div className="mt-2 flex flex-wrap gap-2">{colors.map(c => <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition-transform transform ${color === c ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110' : ''}`} style={{ backgroundColor: c }} />)}</div>
                                </div>
                                <div className="flex items-center">
                                    <input id="edit-isPublic" type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500" />
                                    <label htmlFor="edit-isPublic" className="ml-2 block text-sm text-gray-300">Public Collection</label>
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <button onClick={handleDeleteCollectionPress} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">Delete Collection</button>
                                    <button onClick={handleSaveChanges} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">Save Changes</button>
                                </div>
                            </div>

                            {/* Bookmarks List */}
                            <div className="space-y-2 pt-4 border-t border-slate-700">
                                <h3 className="text-lg font-semibold text-fuchsia-400">Favorites in this Collection ({selectedCollection.bookmarks.length})</h3>
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                    {selectedCollection.bookmarks.length > 0 ? selectedCollection.bookmarks.map(bm => (
                                        <div key={bm.id} className="flex items-center justify-between bg-slate-700 p-2 rounded-lg">
                                            <div className="flex items-center space-x-3 min-w-0">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-slate-600 flex items-center justify-center">
                                                     {bm.favicon ? <img src={bm.favicon} alt="" className="w-full h-full object-cover rounded-md" /> : <GlobeIcon className="w-5 h-5 text-slate-400"/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold truncate text-white">{bm.name}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => openEditBookmark(bm)} className="p-2 rounded-full hover:bg-slate-600" aria-label={`Edit ${bm.name}`}>
                                                <PencilIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )) : (
                                        <p className="text-slate-500 text-sm text-center py-4">This collection has no favorites yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
             <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
            `}</style>

            <EditBookmarkModal 
                isOpen={isEditBookmarkModalOpen}
                onClose={() => setIsEditBookmarkModalOpen(false)}
                bookmark={bookmarkToEdit}
                onSave={handleUpdateBookmarkSubmit}
                onDelete={handleDeleteBookmarkSubmit}
            />
        </>
    );
};

export default EditCollectionModal;