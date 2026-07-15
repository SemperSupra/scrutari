---- MODULE rate_limiter ----
EXTENDS Integers, TLC, FiniteSets, Sequences

CONSTANT IPs, Window, MaxPerWindow

ASSUME Window > 0
ASSUME MaxPerWindow > 0
ASSUME IPs /= {}

VARIABLE now, timestamps, granted, history

vars == <<now, timestamps, granted, history>>

Init == /\ now = 0
        /\ timestamps = [ip \in IPs |-> <<>>]
        /\ granted = [ip \in IPs |-> 0]
        /\ history = <<>>

RecentCount(ip, t) ==
    Cardinality({idx \in 1 .. Len(timestamps[ip]) :
                 timestamps[ip][idx] >= t - Window})

Allowed(ip, t) == RecentCount(ip, t) < MaxPerWindow

Request(ip, t) == /\ now' = t
                  /\ LET allowed == Allowed(ip, t) IN
                     timestamps' = [timestamps EXCEPT ![ip] =
                         IF allowed THEN Append(timestamps[ip], t)
                                    ELSE timestamps[ip]]
                  /\ granted' = [granted EXCEPT ![ip] =
                         IF Allowed(ip, t) THEN granted[ip] + 1
                                           ELSE granted[ip]]
                  /\ history' = Append(history, [ip |-> ip, time |-> t,
                      outcome |-> IF Allowed(ip, t) THEN "allow"
                                                    ELSE "deny"])

Tick(t) == /\ now' = t
           /\ UNCHANGED <<timestamps, granted, history>>

Next == (\E ip \in IPs : \E t \in 0..5 : t > now /\ Request(ip, t))
        \/ (\E t \in 0..5 : t > now /\ Tick(t))

InvRateLimited == \A ip \in IPs : RecentCount(ip, now) <= MaxPerWindow

InvSorted == \A ip \in IPs :
                \A i \in 1 .. Len(timestamps[ip]) - 1 :
                    timestamps[ip][i] <= timestamps[ip][i + 1]

InvTimely == \A ip \in IPs :
                \A idx \in 1 .. Len(timestamps[ip]) :
                    timestamps[ip][idx] <= now
                    /\ timestamps[ip][idx] > now - Window - 1

InvCombined == InvRateLimited /\ InvSorted /\ InvTimely

SpecOK == [](InvCombined)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

=============================================================================
