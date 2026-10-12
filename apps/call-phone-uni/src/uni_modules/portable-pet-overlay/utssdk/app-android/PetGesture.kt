package dev.portablepet.overlay

/** Independent from Android for deterministic gesture boundary tests. Android action constants: 0/1/2/3. */
internal class PetGesture(private val slop: Float) {
    companion object { const val NONE = 0; const val TAP = 1; const val CLOSE = 2 }
    private var down = false
    private var moved = false
    private var x = 0f
    private var y = 0f
    private var at = 0L
    fun markDragged() { moved = true }
    fun accept(action: Int, rawX: Float, rawY: Float, time: Long): Int {
        when (action) {
            0 -> { down = true; moved = false; x = rawX; y = rawY; at = time }
            2 -> if (down && (kotlin.math.abs(rawX - x) > slop || kotlin.math.abs(rawY - y) > slop)) moved = true
            1 -> {
                val valid = down && !moved && kotlin.math.abs(rawX - x) <= slop && kotlin.math.abs(rawY - y) <= slop
                down = false
                if (valid) return if (time - at >= 650) CLOSE else TAP
            }
            3, 5 -> { down = false; moved = true } // cancelled or second pointer: no click/close
        }
        return NONE
    }
}
