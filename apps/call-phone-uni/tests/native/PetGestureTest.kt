package dev.portablepet.overlay

/** Run with PetGesture.kt on a JVM; no Android emulator or framework mocks required. */
fun main() {
    val gesture = PetGesture(12f)
    fun down() { check(gesture.accept(0, 100f, 100f, 1000) == PetGesture.NONE) }
    down(); check(gesture.accept(1, 100f, 100f, 1100) == PetGesture.TAP)
    down(); check(gesture.canHold()); check(gesture.accept(1, 100f, 100f, 1649) == PetGesture.TAP)
    down(); check(gesture.accept(1, 100f, 100f, 1650) == PetGesture.MENU)
    check(!gesture.canHold())
    down(); gesture.accept(2, 150f, 100f, 1400)
    check(gesture.accept(1, 100f, 100f, 2000) == PetGesture.NONE) // dragged back to origin
    down(); gesture.markDragged()
    check(!gesture.canHold())
    check(gesture.accept(1, 110f, 100f, 2000) == PetGesture.NONE) // EasyFloat's threshold < system slop
    down(); gesture.accept(3, 100f, 100f, 1400)
    check(gesture.accept(1, 100f, 100f, 2000) == PetGesture.NONE)
    down(); gesture.accept(5, 100f, 100f, 1400)
    check(gesture.accept(1, 100f, 100f, 2000) == PetGesture.NONE)
    down(); check(gesture.accept(1, 150f, 100f, 2000) == PetGesture.NONE) // missing move event
    check(gesture.accept(1, 100f, 100f, 2100) == PetGesture.NONE) // stray up
    down(); check(gesture.accept(1, 100f, 100f, 1100) == PetGesture.TAP) // next gesture recovers
    down(); check(gesture.takeHold()); check(!gesture.takeHold())
    check(gesture.accept(1, 100f, 100f, 2000) == PetGesture.NONE) // menu opens while holding; release cannot close/reopen it
    down(); gesture.accept(2, 102f, 102f, 1400); check(gesture.canHold())
    check(gesture.takeHold()); check(gesture.accept(1, 102f, 102f, 2000) == PetGesture.NONE)
    down(); gesture.accept(5, 100f, 100f, 1400); check(!gesture.takeHold()); check(!gesture.isDragging())
    println("PetGesture: hold/menu, drag, cancellation and multi-touch boundaries passed")
}
