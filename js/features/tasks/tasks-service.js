import { apiRequest } from '../../api-client.js';
import { memoryCache } from '../../db-services.js';

function toIsoDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function toIsoDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return new Date().toISOString();
    return date.toISOString();
}

function normalizeTask(task) {
    return {
        id: task.id,
        title: task.title || '',
        date: task.date,
        type: task.type || '',
        clientId: task.clientId || '',
        tempClientName: task.tempClientName || '',
        status: task.status || 'Pending',
        notes: task.notes || '',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
    };
}

function normalizeTasks(tasks) {
    return tasks
        .map(normalizeTask)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function dispatchTasksUpdated(tasks) {
    const normalized = normalizeTasks(tasks);
    memoryCache.tasks = normalized;
    window.dispatchEvent(new CustomEvent('tasksUpdated', { detail: normalized }));
    return normalized;
}

function toTaskRequest(data) {
    const payload = {
        title: data.title || '',
        date: toIsoDateTime(data.date || data.taskDate),
        type: data.type || null,
        clientId: data.clientId || null,
        tempClientName: data.tempClientName || null,
        status: data.status || 'Pending',
        notes: data.notes || null
    };

    Object.keys(payload).forEach((key) => {
        if (payload[key] === '' || payload[key] === undefined) {
            payload[key] = null;
        }
    });

    return payload;
}

async function refreshTasksByDate(date, dispatchEvent = true) {
    const tasks = await apiRequest(`/api/tasks?date=${encodeURIComponent(toIsoDate(date))}`);
    const normalized = normalizeTasks(tasks);
    if (dispatchEvent) {
        dispatchTasksUpdated(normalized);
    } else {
        memoryCache.tasks = normalized;
    }
    return normalized;
}

export async function getTasksByDate(date) {
    try {
        return await refreshTasksByDate(date, false);
    } catch (error) {
        console.error('getTasksByDate error:', error);
        throw error;
    }
}

export async function getTasksByRange(from, to, status = null) {
    try {
        const params = new URLSearchParams({
            from: toIsoDate(from),
            to: toIsoDate(to)
        });

        if (status) {
            params.set('status', status);
        }

        const tasks = await apiRequest(`/api/tasks?${params.toString()}`);
        return normalizeTasks(tasks);
    } catch (error) {
        console.error('getTasksByRange error:', error);
        throw error;
    }
}

export async function addTask(data) {
    try {
        const task = await apiRequest('/api/tasks', {
            method: 'POST',
            body: toTaskRequest(data)
        });

        await refreshTasksByDate(task.date || data.date);
        return { id: task.id, ...normalizeTask(task) };
    } catch (error) {
        console.error('addTask error:', error);
        throw error;
    }
}

export function subscribeToDailyTasks(date, callback) {
    let active = true;

    const load = () => {
        refreshTasksByDate(date, false)
            .then((tasks) => {
                if (active) callback(tasks);
            })
            .catch((error) => {
                console.error('subscribeToDailyTasks error:', error);
            });
    };

    const onTasksUpdated = () => load();
    window.addEventListener('tasksUpdated', onTasksUpdated);
    load();

    return () => {
        active = false;
        window.removeEventListener('tasksUpdated', onTasksUpdated);
    };
}

export async function updateTask(id, data) {
    try {
        const existingTask = await findCachedTask(id);
        const task = await apiRequest(`/api/tasks/${id}`, {
            method: 'PUT',
            body: toTaskRequest({ ...existingTask, ...data })
        });

        await refreshTasksByDate(task.date || existingTask.date || data.date);
        return normalizeTask(task);
    } catch (error) {
        console.error('updateTask error:', error);
        throw error;
    }
}

export async function deleteTask(id) {
    try {
        const existingTask = await findCachedTask(id);
        await apiRequest(`/api/tasks/${id}`, { method: 'DELETE' });
        await refreshTasksByDate(existingTask.date || new Date());
    } catch (error) {
        console.error('deleteTask error:', error);
        throw error;
    }
}

async function findCachedTask(id) {
    if (memoryCache.tasks) {
        const task = memoryCache.tasks.find((item) => item.id === id);
        if (task) return task;
    }

    const todayTasks = await refreshTasksByDate(new Date(), false);
    const task = todayTasks.find((item) => item.id === id);
    return task || {};
}
