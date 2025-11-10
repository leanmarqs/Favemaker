
import React, { useState, useEffect } from 'react';
import { Collection } from '../types';
import Modal from './Modal';

interface AddCollectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (collection: Omit<Collection, 'id' | 'createdAt' | 'bookmarks'>) => void;
    collectionToEdit?: Collection | null;
}

const colors = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef"];

const AddCollectionModal: React.FC<AddCollectionModalProps> = ({ isOpen, onClose, onSave, collectionToEdit }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(colors[0]);
    const [isPublic, setIsPublic] = useState(false);

    useEffect(() => {
        if (collectionToEdit) {
            setName(collectionToEdit.name);
            setDescription(collectionToEdit.description);
            setColor(collectionToEdit.color);
            setIsPublic(collectionToEdit.isPublic);
        } else {
            setName('');
            setDescription('');
            setColor(colors[0]);
            setIsPublic(false);
        }
    }, [collectionToEdit, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        onSave({ name, description, color, isPublic });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={collectionToEdit ? "Edit Collection" : "Create Collection"}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300">Name</label>
                    <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300">Description</label>
                    <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Color</label>
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
                        id="isPublic"
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                    />
                    <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-300">Public Collection</label>
                </div>
                <div className="flex justify-end pt-4">
                    <button type="submit" className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Save Collection
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddCollectionModal;
