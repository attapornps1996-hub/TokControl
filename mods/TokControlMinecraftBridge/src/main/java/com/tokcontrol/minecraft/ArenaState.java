package com.tokcontrol.minecraft;

import org.bukkit.World;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public final class ArenaState {

    public static final class Cell3D {
        public final int x;
        public final int z;
        public final int layer;

        public Cell3D(int x, int z, int layer) {
            this.x = x;
            this.z = z;
            this.layer = layer;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Cell3D cell)) return false;
            return x == cell.x && z == cell.z && layer == cell.layer;
        }

        @Override
        public int hashCode() {
            return Objects.hash(x, z, layer);
        }
    }

    private World world;
    private int size = 7;
    private int layers = 9;
    private int layerHeight = 4;
    private int floorY = 4;
    private int centerX;
    private int centerZ;
    private final Set<Cell3D> pathCells = new HashSet<>();
    private final Set<Cell3D> zoneCells = new HashSet<>();

    public World getWorld() {
        return world;
    }

    public void setWorld(World world) {
        this.world = world;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = Math.max(1, size | 1);
    }

    public int getLayers() {
        return layers;
    }

    public void setLayers(int layers) {
        this.layers = Math.max(1, Math.min(20, layers));
    }

    public int getLayerHeight() {
        return layerHeight;
    }

    public void setLayerHeight(int layerHeight) {
        this.layerHeight = Math.max(2, layerHeight);
    }

    public int getFloorY() {
        return floorY;
    }

    public void setFloorY(int floorY) {
        this.floorY = floorY;
    }

    public int getCenterX() {
        return centerX;
    }

    public int getCenterZ() {
        return centerZ;
    }

    public void setCenter(int x, int z) {
        this.centerX = x;
        this.centerZ = z;
    }

    public int layerBaseY(int layer) {
        return floorY + layer * layerHeight;
    }

    public int layerWalkY(int layer) {
        return layerBaseY(layer) + 1;
    }

    public int detectLayerFromY(int y) {
        for (int l = 0; l < layers; l++) {
            int walk = layerWalkY(l);
            if (y >= walk - 1 && y <= walk + 2) return l;
        }
        return Math.max(0, Math.min(layers - 1, (y - floorY) / layerHeight));
    }

    public Set<Cell3D> getPathCells() {
        return pathCells;
    }

    public Set<Cell3D> getZoneCells() {
        return zoneCells;
    }

    public void clearCells() {
        pathCells.clear();
        zoneCells.clear();
    }

    public boolean isInZone(int x, int z, int layer) {
        return zoneCells.contains(new Cell3D(x, z, layer));
    }

    public boolean isPath(int x, int z, int layer) {
        return pathCells.contains(new Cell3D(x, z, layer));
    }

    public void addPath(int x, int z, int layer) {
        Cell3D c = new Cell3D(x, z, layer);
        zoneCells.add(c);
        pathCells.add(c);
    }

    public void removePath(int x, int z, int layer) {
        pathCells.remove(new Cell3D(x, z, layer));
    }

    public void addZone(int x, int z, int layer) {
        zoneCells.add(new Cell3D(x, z, layer));
    }

    public int countFilledLayers() {
        int filled = 0;
        for (int l = 0; l < layers; l++) {
            if (isLayerFull(l)) filled++;
        }
        return filled;
    }

    public boolean isLayerFull(int layer) {
        for (Cell3D c : zoneCells) {
            if (c.layer != layer) continue;
            if (!pathCells.contains(c)) return false;
        }
        return true;
    }

    public boolean isTowerComplete() {
        return isLayerFull(layers - 1) && countFilledLayers() >= layers;
    }
}
