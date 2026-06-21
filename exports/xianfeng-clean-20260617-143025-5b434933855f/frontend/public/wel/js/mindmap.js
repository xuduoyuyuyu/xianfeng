/**
 * Mind Map Tree Layout Algorithm
 * Transforms a graph (DAG) into a visual Tree structure for Mind Map view.
 * Assumes: Left-to-Right layout.
 */
class MindMapLayout {
    constructor(nodes, width, height) {
        this.nodes = nodes;
        this.width = width;
        this.height = height;
        this.levelWidth = 250;
        this.levelGap = 20;
        this.nodeHeight = 84;
        this.siblingGap = 6;
        this.minNodeWidth = 214;
        this.maxNodeWidth = 330;
    }

    /**
     * Calculate x,y coordinates for all nodes in a tree structure
     */
    calculate() {
        if (!this.nodes || this.nodes.length === 0) return;
        this.normalizeNodeSize();

        // 1. Identify Hierarchy (Parent -> Children)
        // Note: Our data has 'links' pointing to Parent (or neighbors).
        // We assume 'core' is root.
        
        const hierarchy = {}; // parentId -> [childNodes]
        const visited = new Set();
        const nodeMap = {};
        let roots = [];

        this.nodes.forEach(n => {
            nodeMap[n.id] = n;
            hierarchy[n.id] = [];
            // Reset temp props
            n._treeH = 0;
            n._depth = 0;
        });

        // Identify Roots
        const core = this.nodes.find(n => n.type === 'core');
        if (core) roots.push(core);
        else roots.push(this.nodes[0]);

        // Build Tree (BFS to handle depth and ownership)
        // We want to assign each node to ONE parent for the Tree Layout (even if it links to multiple)
        const queue = [...roots];
        const claimed = new Set(roots.map(r => r.id));

        while (queue.length > 0) {
            const parent = queue.shift();
            
            // Find nodes that link TO this parent
            // In our data: n1.links = ['core'] => n1 is child of core
            const children = this.nodes.filter(n => 
                !claimed.has(n.id) && 
                n.links && n.links.includes(parent.id)
            );

            children.forEach(child => {
                hierarchy[parent.id].push(child);
                claimed.add(child.id);
                child._depth = (parent._depth || 0) + 1;
                queue.push(child);
            });
        }

        const maxDepth = Math.max(1, ...this.nodes.map(n => n._depth || 0));
        const avgNodeWidth = this.nodes
            .filter(n => n.type !== 'core')
            .reduce((s, n) => s + (n.w || this.minNodeWidth), 0) / Math.max(1, this.nodes.filter(n => n.type !== 'core').length);
        const rootNode = roots[0];
        const rootWidth = rootNode ? (rootNode.w || 160) : 160;
        const usableHalf = Math.max(280, (this.width - rootWidth - 120) / 2);
        const autoGap = (usableHalf - avgNodeWidth * maxDepth) / Math.max(1, maxDepth);
        this.levelGap = Math.max(20, Math.min(20, autoGap));

        // Handle orphans (nodes not connected to main tree)
        const orphans = this.nodes.filter(n => !claimed.has(n.id));
        if (orphans.length > 0) {
            // Attach orphans to root for layout purposes, or treat as separate trees
            // Let's attach to root to keep it single-view
            if (roots.length > 0) {
                orphans.forEach(o => {
                    hierarchy[roots[0].id].push(o);
                    o._depth = 1;
                });
            } else {
                roots = [...roots, ...orphans];
            }
        }

        // 2. Calculate Subtree Heights (Post-Order Traversal)
        const calcHeight = (node) => {
            const children = hierarchy[node.id] || [];
            const nodeBaseH = Math.max(this.nodeHeight, node.h || this.nodeHeight);
            const isExpanded = node.type === 'core' || !!node._expanded;
            if (children.length === 0 || !isExpanded) {
                node._treeH = nodeBaseH;
            } else {
                let h = 0;
                children.forEach(c => h += calcHeight(c));
                h += Math.max(0, children.length - 1) * this.siblingGap;
                node._treeH = Math.max(nodeBaseH, h);
            }
            return node._treeH;
        };

        roots.forEach(r => calcHeight(r));

        // 3. Assign Coordinates (Pre-Order Traversal)
        const layoutNode = (node, x, yStart, availableHeight, direction = 1) => {
            node.x = x;
            node.y = yStart + availableHeight / 2 - (node.h || 75) / 2;

            const children = hierarchy[node.id] || [];
            const isExpanded = node.type === 'core' || !!node._expanded;
            if (children.length > 0 && isExpanded) {
                let currentY = yStart;
                children.forEach(c => {
                    const nextX = direction > 0
                        ? node.x + node.w + this.levelGap
                        : node.x - this.levelGap - c.w;
                    layoutNode(c, nextX, currentY, c._treeH, direction);
                    currentY += c._treeH + this.siblingGap;
                });
            }
        };

        if (roots.length === 1) {
            const root = roots[0];
            root.x = Math.max(40, this.width * 0.22 - root.w / 2);
            root.y = this.height / 2 - (root.h || 160) / 2;
            const firstChildren = hierarchy[root.id] || [];
            firstChildren.sort((a, b) => b._treeH - a._treeH);
            const right = [...firstChildren];
            let rightH = 0;
            right.forEach(c => { rightH += c._treeH; });
            const cy = root.y + (root.h || 160) / 2;
            let rY = cy - rightH / 2;
            right.forEach(c => {
                const x = root.x + root.w + this.levelGap;
                layoutNode(c, x, rY, c._treeH, 1);
                rY += c._treeH;
            });
            return;
        }

        const totalTreeHeight = roots.reduce((sum, r) => sum + r._treeH, 0);
        let startY = (this.height - totalTreeHeight) / 2;
        if (startY < 50) startY = 50;
        roots.forEach(r => {
            layoutNode(r, 100, startY, r._treeH, 1);
            startY += r._treeH;
        });
    }

    /**
     * Generate SVG Path for Curved Connections (Bezier)
     * @param {object} source - Parent node {x, y, w, h}
     * @param {object} target - Child node {x, y, w, h}
     * @returns {string} SVG Path D string
     */
    static getCurvedPath(source, target) {
        const sourceCenterX = source.x + source.w / 2;
        const targetCenterX = target.x + target.w / 2;
        const toRight = targetCenterX >= sourceCenterX;
        const sx = toRight ? source.x + source.w : source.x;
        const sy = source.y + (source.h || 75) / 2;
        const tx = toRight ? target.x : target.x + target.w;
        const ty = target.y + (target.h || 75) / 2;

        const dx = tx - sx;
        const controlX = dx * 0.5;

        return `M${sx},${sy} C${sx + controlX},${sy} ${tx - controlX},${ty} ${tx},${ty}`;
    }

    normalizeNodeSize() {
        this.nodes.forEach(n => {
            if (n.type === 'core') {
                const coreTitle = String(n.label || '');
                const coreSub = String(n.sub || '');
                const coreW = Math.round(240 + Math.min(1, coreTitle.length / 26) * 90);
                const coreH = 54 + (coreSub ? 10 : 0) + (coreTitle.length > 12 ? 4 : 0);
                n.w = Math.max(240, coreW);
                n.h = Math.max(56, Math.min(72, coreH));
                return;
            }
            const title = String(n.label || '');
            const sub = String(n.sub || '');
            const len = Math.max(title.length, sub.length * 1.1);
            const width = Math.round(this.minNodeWidth + Math.min(1, len / 30) * (this.maxNodeWidth - this.minNodeWidth));
            n.w = Math.max(this.minNodeWidth, Math.min(this.maxNodeWidth, width));
            n.h = Math.max(64, n.h || 64);
        });
    }
}

// Export for global usage
window.MindMapLayout = MindMapLayout;
