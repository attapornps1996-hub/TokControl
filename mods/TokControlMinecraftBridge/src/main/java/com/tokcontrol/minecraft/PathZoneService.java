package com.tokcontrol.minecraft;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public final class PathZoneService {

    private final TokControlPlugin plugin;
    private final ArenaBuilder arenaBuilder;
    private final ArenaState state;
    private final Random random = new Random();

    public PathZoneService(TokControlPlugin plugin, ArenaBuilder arenaBuilder, ArenaState state) {
        this.plugin = plugin;
        this.arenaBuilder = arenaBuilder;
        this.state = state;
    }

    public int expand(int amount) {
        int delta = Math.max(1, amount);
        state.setSize(state.getSize() + delta);
        arenaBuilder.buildArena(state.getWorld());
        return state.getSize();
    }

    public int shrink(int amount) {
        int delta = Math.max(1, amount);
        state.setSize(Math.max(5, state.getSize() - delta));
        arenaBuilder.buildArena(state.getWorld());
        return state.getSize();
    }

    public int bridge(Player player, int length) {
        World world = player.getWorld();
        Location loc = player.getLocation();
        int layer = state.detectLayerFromY(loc.getBlockY());
        var dir = loc.getDirection();
        int dx = Math.abs(dir.getX()) >= Math.abs(dir.getZ()) ? (dir.getX() >= 0 ? 1 : -1) : 0;
        int dz = dx == 0 ? (dir.getZ() >= 0 ? 1 : -1) : 0;
        int startX = loc.getBlockX();
        int startZ = loc.getBlockZ();
        int placed = 0;
        for (int i = 0; i < length; i++) {
            int x = startX + dx * i;
            int z = startZ + dz * i;
            if (!state.isInZone(x, z, layer)) continue;
            arenaBuilder.placeCell(world, x, z, layer, true);
            placed++;
        }
        return placed;
    }

    public int meltAll() {
        World world = state.getWorld();
        if (world == null) return 0;
        List<ArenaState.Cell3D> cells = new ArrayList<>(state.getPathCells());
        for (ArenaState.Cell3D c : cells) {
            arenaBuilder.clearCellPath(world, c.x, c.z, c.layer);
        }
        return cells.size();
    }

    public int fillAll() {
        World world = state.getWorld();
        if (world == null) return 0;
        int count = 0;
        for (ArenaState.Cell3D c : new ArrayList<>(state.getZoneCells())) {
            arenaBuilder.placeCell(world, c.x, c.z, c.layer, true);
            count++;
        }
        return count;
    }

    public int fillLayer(int layer) {
        World world = state.getWorld();
        if (world == null) return 0;
        int count = 0;
        for (ArenaState.Cell3D c : new ArrayList<>(state.getZoneCells())) {
            if (c.layer != layer) continue;
            arenaBuilder.placeCell(world, c.x, c.z, c.layer, true);
            count++;
        }
        return count;
    }

    public int buildNextLayer() {
        World world = state.getWorld();
        if (world == null) return -1;
        for (int l = 0; l < state.getLayers(); l++) {
            if (!state.isLayerFull(l)) {
                fillLayer(l);
                return l + 1;
            }
        }
        return state.getLayers();
    }

    public boolean isTowerComplete() {
        return state.isTowerComplete();
    }

    public int tntBlast(int level) {
        World world = state.getWorld();
        if (world == null) return 0;
        double chance = switch (Math.max(1, Math.min(3, level))) {
            case 1 -> 0.15;
            case 2 -> 0.35;
            default -> 0.60;
        };
        int blasted = 0;
        List<ArenaState.Cell3D> cells = new ArrayList<>(state.getPathCells());
        for (ArenaState.Cell3D c : cells) {
            if (random.nextDouble() > chance) continue;
            int y = state.layerWalkY(c.layer);
            Location loc = new Location(world, c.x + 0.5, y, c.z + 0.5);
            world.createExplosion(loc, 0.5f, false, false);
            arenaBuilder.clearCellPath(world, c.x, c.z, c.layer);
            blasted++;
        }
        return blasted;
    }

    public boolean isOnFinish(Player player) {
        Location loc = player.getLocation();
        int top = state.getLayers() - 1;
        int finishY = state.layerWalkY(top);
        return Math.abs(loc.getBlockX() - state.getCenterX()) <= 1
                && Math.abs(loc.getBlockZ() - state.getCenterZ()) <= 1
                && Math.abs(loc.getBlockY() - finishY) <= 2
                && loc.getBlockY() >= finishY - 1;
    }
}
